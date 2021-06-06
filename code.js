const apiUrl = "https://api.discogs.com";

function getData(url, getAllPages = false)
{
    var options = {
        "muteHttpExceptions": true
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
        var pageUrl = url + `&page=${page}`;
        data.push(UrlFetchApp.fetch(pageUrl, options).getContentText());
    }

    return data;
}

function collateArrays(path, objects)
{
    var outArray = [];
    var chunks = path.split('.');

    // Iterate over each object
    for (const resp of objects)
    {
        var obj = JSON.parse(resp);
        for (const chunk of chunks)
        {
            obj = obj[chunk];
        }
        outArray = outArray.concat(obj);
    }

    return outArray;
}

////////////////////////////////////////////////////

function retrieveProfile()
{
    // Set request URL
    var url = `${apiUrl}/users/${config.username}?token=${config.apiToken}`;

    // Request the data, and extract the values
    var data = getData(url);
    data = JSON.parse(data);

    // Save JSON data to backup folder
    var profileData = JSON.stringify(data, null, 4);
    common.updateOrCreateFile(config.backupDir, config.username + ".json", profileData);
}

function retrieveCollection()
{
    // Set request URL
    var url = `${apiUrl}/users/${config.username}/collection?token=${config.apiToken}`;

    // Request the data, and extract the values
    var data = getData(url, true);

    // Fold array of responses into single structure
    data = collateArrays("releases", data);

    // Save raw data to backup folder
    if (config.outputFormat.includes("rawJson"))
    {
        var rawData = JSON.stringify(data, null, 4);
        common.updateOrCreateFile(config.backupDir, "collection.raw.json", rawData);
    }

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
                folder: release.folder.name,
            };
        });

        // Save to backup folder
        var prettyData = JSON.stringify(filteredData, null, 4);
        common.updateOrCreateFile(config.backupDir, "collection.json", prettyData);
    }
}

function main()
{
    // Don't do anything if there's no output formats
    if (config.outputFormat.length < 1)
    {
        return;
    }

    retrieveProfile();
    retrieveCollection();
}