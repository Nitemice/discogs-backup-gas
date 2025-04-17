const apiUrl = "https://api.discogs.com";

function getData(url, getAllPages = false)
{
    // Make sure URL includes query string
    if (!url.includes('?'))
    {
        url = url + '?';
    }

    var headers = {
        "Authorization": `Discogs token=${config.apiToken}`,
        "Content-Type": "application/json"
    };

    var options = {
        "muteHttpExceptions": true,
        "headers": headers
    };
    var data = [UrlFetchApp.fetch(url, options).getContentText()];

    // Bail out if we only wanted the first page
    if (!getAllPages)
    {
        return data[0];
    }

    // Retrieve page count, if instructed
    var pageObj = JSON.parse(data[0]);
    var totalPages = pageObj["pagination"]["pages"];
    for (let page = 2; page <= totalPages; page++)
    {
        var pageUrl = `${url}&page=${page}`;
        data.push(UrlFetchApp.fetch(pageUrl, options).getContentText());
    }

    return data;
}

function addToCsvOutput(output, input, leadingComma = true)
{
    if (leadingComma)
    {
        output += ',';
    }

    // Replace any quotes with 2 quotes
    input = String(input).replaceAll('"', '""');

    // Wrap in quotes if there's a comma or a linebreak
    if (input.match(/[,\n]/)) 
    {
        output += '"' + input + '"';
    }
    else
    {
        output += input;
    }
    return output;
}

////////////////////////////////////////////////////

function retrieveProfile()
{
    // Set request URL
    var url = `${apiUrl}/users/${config.username}`;

    // Request the data, and extract the values
    var data = getData(url);
    data = JSON.parse(data);

    // Save JSON data to backup folder
    var profileData = JSON.stringify(data, null, 4);
    common.updateOrCreateFile(config.backupDir, `${config.username}.json`, profileData);
}

function retrieveCollection()
{
    // Set request URL
    var url = `${apiUrl}/users/${config.username}/collection/folders/0/releases`;

    // Request the data, and extract the values
    var data = getData(url, true);

    // Fold array of responses into single structure
    data = common.collateArrays("releases", data);

    // Save raw data to backup folder
    if (config.outputFormat.includes("rawJson"))
    {
        var rawData = JSON.stringify(data, null, 4);
        common.updateOrCreateFile(config.backupDir, "collection.raw.json", rawData);
    }

    // Bail out if we only want raw JSON
    if (config.outputFormat.every(element => { element = "rawJson" }))
    {
        return;
    }

    // Retrieve folders for later use
    // Set request URL
    url = `${apiUrl}/users/${config.username}/collection/folders`;

    // Request the data, and extract the values
    var folderData = getData(url);
    folderData = JSON.parse(folderData);

    // Flip data into map, so we can find folder names by id
    var folderMap = new Map();
    folderData.folders.forEach(folder =>
    {
        folderMap.set(folder.id, folder.name);
    });

    if (config.outputFormat.includes("json"))
    {
        // Parse release data into a more useful format
        var filteredData = data.map(function(release)
        {
            return {
                release_id: release.release_id,
                collection_id: release.collection_id,
                title: release.basic_information.title,
                artists: release.basic_information.artists_sort,
                year: release.basic_information.year,
                labels: release.basic_information.labels,
                identifiers: release.basic_information.identifiers,
                release_date: release.basic_information.released_formatted,
                // format: release.basic_information.formats[0].descriptions[0],
                notes: release.basic_information.notes,
                date_added: release.date_added,
                rating: release.rating,
                folder: folderMap.get(release.folder_id),
            };
        });

        // Save to backup folder
        var prettyData = JSON.stringify(filteredData, null, 4);
        common.updateOrCreateFile(config.backupDir, "collection.json", prettyData);
    }

    if (config.outputFormat.includes("csv"))
    {
        // Retrieve note fields for later use
        // Set request URL
        url = `${apiUrl}/users/${config.username}/collection/fields`;

        // Request the data, and extract the values
        var fieldsData = getData(url);
        fieldsData = JSON.parse(fieldsData);

        // Flip data into map, so we can find fields names by id
        var fieldsMap = new Map();
        fieldsData.fields.forEach(field =>
        {
            fieldsMap.set(field.id, field.name);
        });

        // Write header line
        var csvOutput =
            "CatalogNo,Artist,Title,Label,Format,Rating,Released,ReleaseId," +
            "CollectionFolder,DateAdded";

        // Add any note field names to header line
        fieldsMap.forEach(fieldName =>
        {
            csvOutput = addToCsvOutput(csvOutput, fieldName);
        });

        csvOutput += "\n";

        // Parse data into CSV format
        data.forEach(release =>
        {
            // Catalog#
            const catNo = common.collateValues("catno",
                release.basic_information.labels).join(", ");
            csvOutput = addToCsvOutput(csvOutput, catNo, false);

            // Artist
            const artists = common.collateValues("name",
                release.basic_information.artists).join(", ");
            csvOutput = addToCsvOutput(csvOutput, artists);

            // Title
            csvOutput = addToCsvOutput(csvOutput,
                release.basic_information.title);

            // Label
            const labels = common.collateValues("name",
                release.basic_information.labels).join(", ");
            csvOutput = addToCsvOutput(csvOutput, labels);

            // Format
            const formatDesc = release.basic_information.formats[0].descriptions
                || [];
            const formats = [release.basic_information.formats[0].name,
            ...formatDesc].join(", ");
            csvOutput = addToCsvOutput(csvOutput, formats);

            // Rating
            csvOutput = addToCsvOutput(csvOutput, release.rating);

            // Released
            csvOutput = addToCsvOutput(csvOutput, release.basic_information.year);

            // ReleaseId
            csvOutput = addToCsvOutput(csvOutput, release.id);

            // CollectionFolder
            const folder = folderMap.get(release.folder_id);
            csvOutput = addToCsvOutput(csvOutput, folder);

            // DateAdded
            csvOutput = addToCsvOutput(csvOutput, release.date_added);

            // Flip data into map, so we can find folder names by id
            var noteMap = new Map();
            (release.notes || []).forEach(note =>
            {
                noteMap.set(note.field_id, note.value);
            });

            fieldsMap.forEach(function(fieldName, fieldId)
            {
                if (noteMap.has(fieldId))
                {
                    csvOutput = addToCsvOutput(csvOutput, noteMap.get(fieldId))
                }
                else
                {
                    csvOutput += ",";
                }
            });

            csvOutput += "\n";
        });

        // Save to backup folder
        common.updateOrCreateFile(config.backupDir, "collection.csv", csvOutput);
    }
}

function main()
{
    // Don't do anything if there's no output formats
    if (config.outputFormat.length < 1)
    {
        throw new Error("No output formats specified. Update config file, and try again.");
    }

    retrieveProfile();
    retrieveCollection();
}