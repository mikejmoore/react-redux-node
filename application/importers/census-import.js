const censusKey = "54e58ceb2cbb922837bde9d29ff87936a1eff60c";
dbUtils = require('../database/db-utils');

// Notes about API calls that work for each year.
// 2015 - 2016
// http://api.census.gov/data/2016/pep/components?get=BIRTHS,DEATHS,GEONAME&for=state:*&PERIOD=1&key=54e58ceb2cbb922837bde9d29ff87936a1eff60c
// http://api.census.gov/data/2016/pep/population?get=POP,GEONAME&for=state:*&DATE=8&key=54e58ceb2cbb922837bde9d29ff87936a1eff60c

// http://api.census.gov/data/2015/pep/components?get=BIRTHS,DEATHS,GEONAME&for=state:*&PERIOD=1&key=54e58ceb2cbb922837bde9d29ff87936a1eff60c
// http://api.census.gov/data/2015/pep/population?get=POP,GEONAME&for=state:*&DATE=8&key=54e58ceb2cbb922837bde9d29ff87936a1eff60c

// 2014
// Pop and birth/death - Date seems to be in 2 month increments
// http://api.census.gov/data/2014/pep/natstprc?get=STNAME,POP,BIRTHS,DEATHS,DOM&for=state:*&DATE=6&key=54e58ceb2cbb922837bde9d29ff87936a1eff60c

// 2013
// Pop and birth/death - Date seems to be in 2 month increments
// http://api.census.gov/data/2013/pep/natstprc?get=POP,BIRTHS,DEATHS&for=state:*&DATE=6&key=54e58ceb2cbb922837bde9d29ff87936a1eff60c

// 2012 - none of the above works


// We will import
const START_YEAR = 2013;
const END_YEAR = 2016;


var _censusImporter = null;

exports.importIfEmpty = function() {
    censusDb = require('../database/census-db');
    censusDb.collection((collection) => {
        collection.count({ state: 'co'}, (err, count) => {
            if (count == 0) {
                _censusImporter = new CensusImport(() => {
                    console.info("Done importing records");
                });

            } else {
                console.info("Census data present - no import performed.");
            }
        });
    });
}

exports.import = function() {
    try {
        _censusImporter = new CensusImport(() => {
            console.info("Done importing records");
        });
    } catch (err) {
        console.error("Exception in code" + err.stack);
    }
}

exports.inProgress = function() {
    return ((_censusImporter != null) && (_censusImporter.isDone() == false));
}


function CensusImport(callback) {
    this.censusDb = require('../database/complaint-db');
    clearPromise = this.censusDb.clear(() => {
        this.lastEvent = null;
        this.submitApiRequests(callback);
    });
}


CensusImport.prototype.submitApiRequests = function(callback) {
    this.callback = callback;
    this.numberOfRequestsStarted = 0;
    this.numberOfRequestsCompleted = 0;
    this.numberOfRecordsToSave = 0;
    this.fields = null;
    this.dataHash = new Object();
    this.host = "api.census.gov";
    this.requests = [];

    // Lucky for me, every year requires different census API calls to gather the same data.
    //   Request a month at a time for each year
    for (var month = 1; month <= 12; month++) {
        this.requests.push({year: 2013, month: month, period_months: 1, mid_endpoint: "natstprc", fields: "STNAME,POP,BIRTHS,DEATHS", dateField: "DATE"});
        this.requests.push({year: 2014, month: month, period_months: 1, mid_endpoint: "natstprc", fields: "STNAME,POP,BIRTHS,DEATHS", dateField: "DATE"});
        this.requests.push({year: 2015, month: month, period_months: 1, mid_endpoint: "components", fields: "BIRTHS,DEATHS,GEONAME", dateField: "PERIOD"});
        this.requests.push({year: 2015, month: month, period_months: 1, mid_endpoint: "population", fields: "POP,GEONAME", dateField: "DATE"});
        this.requests.push({year: 2016, month: month, period_months: 1, mid_endpoint: "components", fields: "BIRTHS,DEATHS,GEONAME", dateField: "PERIOD"});
        this.requests.push({year: 2016, month: month, period_months: 1, mid_endpoint: "population", fields: "POP,GEONAME", dateField: "DATE"});
    }

    this.numberOfRequestsStarted = this.requests.length;
    this.requests.forEach(function(request) {
        this.performRequest(request);
    }.bind(this));

}

/*
    Initialize a hashes for a state to cover full date range being queried and saved here from the census.
 */
CensusImport.prototype.createStateHash = function(state) {
    this.dataHash[state] = new Object();
    for (var year = START_YEAR; year <= END_YEAR; year++) {
        this.dataHash[state][year] = new Object();
        for (var month = 1; month <= 12; month++) {
            this.dataHash[state][year][month] = new Object();
            this.numberOfRecordsToSave++;
        }
    }
}


/*
    Write one particular state's census data, for specific month and year, to our storage hash.
 */
CensusImport.prototype.processStateRow = function(year, month, fields, stateRow) {
    var dataHash = this.dataHash;
    indexOfState = fields.indexOf("geoname");
    if (indexOfState < 0) indexOfState = fields.indexOf("stname");
    var state = stateRow[indexOfState];

    //  Some years have states like: 'Alabama, East South Central, South, United States'
    state = state.split(",")[0];
    state = dbUtils.stateNameToCode(state).toLowerCase();

    if (dataHash[state] == null) {
        this.createStateHash(state);
    }

    var monthYear = dbUtils.encodeYearMonth(year, month);
    stateRow.forEach(function(column, index) {
        columnName = fields[index];
        if ((column) && (columnName != "geoname") && (columnName != "stname") && (columnName != "dom") && (columnName != "period") && (columnName != "state") && (columnName != "date")) {
            dataHash[state][year][month][columnName] = parseInt(column);
        }
    });
}

/*
    Write response of census api call to our hash of all census data.
 */
CensusImport.prototype.processRequest = function(year, month, dataOut) {
    fields = [];
    headerRow = dataOut[0];
    headerRow.forEach(function(column, index) {
        fieldName = column.toLowerCase();
        fields.push(fieldName);
    });

    for(i = 1; i < dataOut.length - 1; i++) {
        stateRow = dataOut[i];
        this.processStateRow(year, month, fields, stateRow);
    }
}

CensusImport.prototype.isDone = function() {
    return ((this.numberOfRequestsCompleted == this.numberOfRequestsStarted) && (this.numberOfRecordsToSave == 0));
}

/*
    Issue request for a date range and all states to census api and send results to processRequest.
 */
CensusImport.prototype.performRequest = function(request) {
    method = "GET";
    var endpoint = "/data/" + request.year + "/pep/" + request.mid_endpoint;
    var querystring = require('querystring');
    var http = require('http');
    var dataIn = {
        get: request.fields,
        for: "state:*",
        key: censusKey
    }
    dataIn[request.dateField] = request.month

    var dataString = JSON.stringify(dataIn);
    var headers = {};

    if (method == 'GET') {
        endpoint += '?' + querystring.stringify(dataIn);
    } else {
        headers = {
            'Content-Type': 'application/json',
            'Content-Length': dataString.length
        };
    }
    var options = {
        host: this.host,
        path: endpoint,
        method: method,
        headers: headers
    };
    this.requestInProgressCount++;

    var req = http.request(options, function(res) {
        res.setEncoding('utf-8');
        var responseString = '';
        if (res.statusCode == 200) {
            res.on('data', function(data) {
                responseString += data;
            });

            res.on('end', function() {
                var responseObject = JSON.parse(responseString);
                this.processRequest(request.year, request.month, responseObject);
            }.bind(this));
        }
        console.info("Census request: " + this.numberOfRequestsCompleted + " of " + this.numberOfRequestsStarted);
        this.numberOfRequestsCompleted++;
        if (this.numberOfRequestsStarted == this.numberOfRequestsCompleted) {
            this.fillInMissingData(this.dataHash);
            this.writeToDatabase();
        }
    }.bind(this));
    req.write(dataString);
    req.end();
}


/*
    Census api data has lots gaps in some fields for lots of months.
     Function estimates missing data and fills it in on our data hash.
 */
CensusImport.prototype.fillInMissingData = function(data, fieldName) {
    for (var key in data) {
        stateData = data[key];
        var lastFields = new Object();
        lastFields['popgrowth'] = 0;
        for (var year = START_YEAR; year <= END_YEAR; year++) {
            for (var month = 1; month <= 12; month++) {
                var monthData = stateData[year][month];
                var previousPopulation = lastFields['pop'];
                var previousPopGrowth = lastFields['popgrowth'];
                var monthPopulation = monthData['pop'];

                for (var fieldKey in lastFields) {
                    if (!monthData[fieldKey]) {
                        monthData[fieldKey] = lastFields[fieldKey];
                    }
                }
                if ((previousPopulation) && (monthPopulation)) {
                    monthData['popgrowth'] = monthPopulation - previousPopulation;
                }

                //  Try to calculate population growth, if month missing population, stick with last months pop growth.
                if ((previousPopulation) && (monthPopulation == null)) {
                    monthData['pop'] = previousPopulation + lastFields['popgrowth'];
                }
                for (var fieldKey in monthData) {
                    if (monthData[fieldKey]) {
                        lastFields[fieldKey] = monthData[fieldKey];
                    }
                }
            }
        }
    }
}


/*
    Write the accumulated data hash to storage.
 */
CensusImport.prototype.writeToDatabase = function(censusImport) {
    censusDb = require('../database/census-db');
    dataHash = this.dataHash;
    var importer = this;
    censusDb.clear(function(result) {
        for (var stateKey in dataHash) {
            stateData = dataHash[stateKey];
            for (var year = START_YEAR; year <= END_YEAR; year++) {
                for (var month = 1; month <= 12; month++) {
                    var monthData = stateData[year][month];
                    monthData["state"] = stateKey;
                    monthData["year"] = year;
                    monthData["month"] = month;
                    censusDb.create(monthData, function(err, record) {
                        importer.numberOfRecordsToSave--;
                        if (importer.numberOfRecordsToSave == 0) {
                            importer.callback(this);
                        }
                    });
                };
            };
        }
    }.bind(this));
}




