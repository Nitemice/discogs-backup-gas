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

    // Save JSON data to backup folder
    common.updateOrCreateJsonFile(config.backupDir, `${config.username}.json`,
        data);
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
        common.updateOrCreateJsonFile(config.backupDir, "collection.raw.json",
            data);
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

    if (config.outputFormat.includes("json"))
    {
        // Parse release data into a more useful format
        var filteredData = data.map(function(release)
        {
            let notes = (release.notes || []).map((note) =>
            {
                return {
                    "field": fieldsMap.get(note.field_id),
                    "value": note.value
                }
            });

            return {
                release_id: release.id,
                title: release.basic_information.title,
                artists: release.basic_information.artists,
                year: release.basic_information.year,
                labels: release.basic_information.labels,
                format: release.basic_information.formats,
                notes: notes,
                rating: release.rating,
                folder: folderMap.get(release.folder_id),
                date_added: release.date_added,
            };
        });

        // Save to backup folder
        common.updateOrCreateJsonFile(config.backupDir, "collection.json",
            filteredData);
    }

    if (config.outputFormat.includes("csv"))
    {


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
        common.updateOrCreateFile(config.backupDir, "collection.csv",
            csvOutput);
    }
}

function retrieveWantlist()
{
    // Set request URL
    var url = `${apiUrl}/users/${config.username}/wants`;

    // Request the data, and extract the values
    var data = getData(url, true);

    // Fold array of responses into single structure
    data = common.collateArrays("wants", data);

    // Save raw data to backup folder
    if (config.outputFormat.includes("rawJson"))
    {
        common.updateOrCreateJsonFile(config.backupDir, "wantlist.raw.json",
            data);
    }

    // Bail out if we only want raw JSON
    if (config.outputFormat.every(element => { element = "rawJson" }))
    {
        return;
    }

    if (config.outputFormat.includes("json"))
    {
        // Parse release data into a more useful format
        var filteredData = data.map(function(release)
        {
            return {
                release_id: release.id,
                title: release.basic_information.title,
                artists: release.basic_information.artists,
                year: release.basic_information.year,
                labels: release.basic_information.labels,
                format: release.basic_information.formats,
                rating: release.rating,
                notes: release.notes,
                date_added: release.date_added,
            };
        });

        // Save to backup folder
        common.updateOrCreateJsonFile(config.backupDir, "wantlist.json",
            filteredData);
    }

    if (config.outputFormat.includes("csv"))
    {

        // Write header line
        var csvOutput =
            "CatalogNo,Artist,Title,Label,Format,Rating,Released,ReleaseId,Notes";
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
            const formatDesc =
                release.basic_information.formats[0].descriptions || [];
            const formats = [release.basic_information.formats[0].name,
            ...formatDesc].join(", ");
            csvOutput = addToCsvOutput(csvOutput, formats);

            // Rating
            csvOutput = addToCsvOutput(csvOutput, release.rating);

            // Released
            csvOutput = addToCsvOutput(csvOutput,
                release.basic_information.year);

            // ReleaseId
            csvOutput = addToCsvOutput(csvOutput, release.id);

            // Notes
            csvOutput = addToCsvOutput(csvOutput, release.notes);

            csvOutput += "\n";
        });

        // Save to backup folder
        common.updateOrCreateFile(config.backupDir, "wantlist.csv", csvOutput);
    }
}


function retrieveContributions()
{
    // Set request URL
    var url = `${apiUrl}/users/${config.username}/contributions`;

    // Request the data, and extract the values
    var data = getData(url, true);

    // Fold array of responses into single structure
    data = common.collateArrays("contributions", data);

    // Save raw data to backup folder
    if (config.outputFormat.includes("rawJson"))
    {
        common.updateOrCreateJsonFile(config.backupDir,
            "contributions.raw.json", data);
    }

    // Bail out if we only want raw JSON
    if (config.outputFormat.every(element => { element = "rawJson" }))
    {
        return;
    }

    if (config.outputFormat.includes("json"))
    {
        // Parse release data into a more useful format
        var filteredData = data.map(function(release)
        {
            return {
                release_id: release.id,
                uri: release.uri,
                title: release.title,
                artists: release.artists,
                year: release.year,
                labels: release.labels,
                identifiers: release.identifiers,
                companies: release.companies,
                format: release.formats,
                rating: release.rating,
                notes: release.notes,
                date_added: release.date_added,
                date_changed: release.date_changed,
                status: release.status,
            };
        });

        // Save to backup folder
        common.updateOrCreateJsonFile(config.backupDir, "contributions.json",
            filteredData);
    }

    if (config.outputFormat.includes("csv"))
    {

        // Write header line
        var csvOutput =
            "CatalogNo,Artist,Title,Label,Format,Rating,Released,ReleaseId";
        csvOutput += "\n";

        // Parse data into CSV format
        data.forEach(release =>
        {
            // Catalog#
            const catNo = common.collateValues("catno",
                release.labels).join(", ");
            csvOutput = addToCsvOutput(csvOutput, catNo, false);

            // Artist
            const artists = common.collateValues("name",
                release.artists).join(", ");
            csvOutput = addToCsvOutput(csvOutput, artists);

            // Title
            csvOutput = addToCsvOutput(csvOutput, release.title);

            // Label
            const labels = common.collateValues("name",
                release.labels).join(", ");
            csvOutput = addToCsvOutput(csvOutput, labels);

            // Format
            const formatDesc = release.formats[0].descriptions
                || [];
            const formats = [release.formats[0].name, ...formatDesc].join(", ");
            csvOutput = addToCsvOutput(csvOutput, formats);

            // Rating
            csvOutput = addToCsvOutput(csvOutput, release.rating);

            // Released
            csvOutput = addToCsvOutput(csvOutput, release.year);

            // ReleaseId
            csvOutput = addToCsvOutput(csvOutput, release.id);

            csvOutput += "\n";
        });

        // Save to backup folder
        common.updateOrCreateFile(config.backupDir, "contributions.csv",
            csvOutput);
    }
}

function retrieveListItems(listId, prevMetadata, backupDir)
{
    // Set request URL
    var url = `${apiUrl}/lists/${listId}`;

    // Request the data, and extract the values
    var data = getData(url, false);
    data = JSON.parse(data);

    // Setup list filename
    var filename = data.name + "_" + data.id;
    filename = filename.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();

    // Set up metadata info
    var metadata = {
        "id": listId,
        "filename": filename,
        "lastChanged": data.date_changed
    }

    // Check if this list has been updated since last backup
    if (prevMetadata &&
        prevMetadata.lastChanged == metadata.date_changed)
    {
        return metadata;
    }


    // Save raw data to backup folder
    if (config.outputFormat.includes("rawJson"))
    {
        common.updateOrCreateJsonFile(backupDir, filename + ".raw.json", data);
    }

    // Bail out if we only want raw JSON
    if (config.outputFormat.every(element => { element = "rawJson" }))
    {
        return metadata;
    }

    if (config.outputFormat.includes("json"))
    {
        // Parse release data into a more useful format
        var filteredData = {
            list_id: data.id,
            name: data.name,
            description: data.description,
            date_added: data.date_added,
            date_changed: data.date_changed,
            username: data.user.username,
            user_id: data.user.id,
            public: data.public,
            items: data.items.map(function(item)
            {
                delete item.resource_url;
                delete item.image_url;
                delete item.stats;
                return item;
            })
        };

        // Save to backup folder
        common.updateOrCreateJsonFile(backupDir, filename + ".json",
            filteredData);
    }

    if (config.outputFormat.includes("csv"))
    {

        // Write header line
        var csvOutput = "Type,Id,Title,Uri,Comment";
        csvOutput += "\n";

        // Parse data into CSV format
        data.items.forEach(item =>
        {
            // Type
            csvOutput = addToCsvOutput(csvOutput, item.type, false);

            // Id
            csvOutput = addToCsvOutput(csvOutput, item.id);

            // Title
            csvOutput = addToCsvOutput(csvOutput, item.display_title);

            // Uri
            csvOutput = addToCsvOutput(csvOutput, item.uri);

            // Comment
            csvOutput = addToCsvOutput(csvOutput, item.comment);

            csvOutput += "\n";
        });

        // Save to backup folder
        common.updateOrCreateFile(backupDir, filename + ".csv", csvOutput);
    }

    return metadata;
}

function retrieveLists()
{
    // Set request URL
    var url = `${apiUrl}/users/${config.username}/lists`;

    // Request the data, and extract the values
    var data = getData(url, true);

    // Fold array of responses into single structure
    data = common.collateArrays("lists", data);

    if (data.length < 1)
    {
        return;
    }

    // Make a folder for list files
    var backupFolder = common.findOrCreateFolder(config.backupDir, "lists").getId();

    // Retrieve a meta list of lists for service purposes
    var metaListFile =
        common.findOrCreateFile(backupFolder, "meta.list.json", "{}");
    let metaList = common.getJsonFileContent(metaListFile);
    let killList = { ...metaList };

    data.forEach(element =>
    {
        metaList[element.id] =
            retrieveListItems(element.id, metaList[element.id], backupFolder);

        delete killList[element.id];

        // Write the meta list, so we don't lose anything
        metaListFile.setContent(JSON.stringify(metaList));
    });

    // Delete lists that no longer exist,
    // i.e. on the meta list, but not returned by the API
    if (config.removeMissingLists && Object.keys(killList).length > 0)
    {
        for (const [id, info] of Object.entries(killList))
        {
            common.deleteFile(backupFolder, info.filename + ".raw.json");
            common.deleteFile(backupFolder, info.filename + ".json");
            common.deleteFile(backupFolder, info.filename + ".csv");

            // Remove the now-deleted file from the meta list
            delete metaList[id];

            // Write the meta list, so we don't lose anything
            metaListFile.setContent(JSON.stringify(metaList));
        }
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
    retrieveWantlist();
    retrieveContributions();
    retrieveLists();
}