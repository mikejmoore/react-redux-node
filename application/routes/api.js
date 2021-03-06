'use strict';

var util = require('util');
var express = require('express');
var router = express.Router();
var cors = require('cors');

/*
    Define all API routes for census/complaint info.
 */
router.use(function(req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Request-Method', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET');
    res.setHeader('Access-Control-Allow-Headers', '*');
    next(); // go to the next routes and don't stop here
});



router.get('/', cors(), function(req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Request-Method', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.json({ message: 'You have connected to our API.  Consult documentation for endpoints' });
});


// /api/complaints endpoint
var complaintsQueries = require('../database/complaint-queries');

router.get('/states', function(req, res, next) {
    try {
        var dbUtils = require('../database/db-utils');
        res.json({states: dbUtils.stateList()});
    } catch(err) {
        console.error("Error finding states: " + err.message);
        console.error("Error finding states: " + err.fullStackTrace);
        throw err;
    }
});


/*
 *  Find states with complaints that match either a particular company or particular product over period of time.
 *  Example: /api/complaints/states?year=2015&month=6&months=12&company=Bank+of+America
 */
router.get('/complaints/states', function(req, res, next) {
    var reqData = {
        year :      parseInt(req.query.year),
        month :     parseInt(req.query.month),
        months :    parseInt(req.query.months),
        company :   req.query.company,
        product :   req.query.product,
        limit: 10
    }
    if (req.query.limit) reqData.limit = parseInt(req.query.limit);
    complaintsQueries.states(reqData, (documents) => {
        res.json({states: documents, query: reqData});
    });
});

/*
 *  Find top products with complaints in a state (or nation, if state is not passed).
 *  Example: /api/complaints/products?year=2016&month=1&months=12&state=ny
 */
router.get('/complaints/products', function(req, res, next) {
    var reqData = {
        year :      parseInt(req.query.year),
        month :     parseInt(req.query.month),
        months :    parseInt(req.query.months),
        state :     req.query.state,
        limit: 10
    }
    if (req.query.limit) reqData.limit = parseInt(req.query.limit);
    complaintsQueries.products(reqData, (documents) => {
        res.json({products: documents, query: reqData});
    });
});


router.get('/complaints/companies', function(req, res, next) {
    var reqData = {
        year :      parseInt(req.query.year),
        month :     parseInt(req.query.month),
        months :    parseInt(req.query.months),
        state :     req.query.state,
        limit: 10
    }
    if (req.query.limit) reqData.limit = parseInt(req.query.limit);
    complaintsQueries.companies(reqData, (documents) => {
        res.json({companies: documents, query: reqData});
    });
});


// ****************************************************************
// /api/census endpoint
// ****************************************************************


var censusQueries = require('../database/census-queries');

/*
 *  Find top states by population, births, deaths, pop growth on particular month
 *  Example: http://localhost:3000/api/census/topstates?year=2015&month=5&field=popgrowth&limit=10
 */
router.get('/census/topstates/', function(req, res, next) {
    var reqData = {
        limit: parseInt(req.query.limit),
        year: parseInt(req.query.year),
        month: parseInt(req.query.month),
        sort_field:  req.query.field
    }
    censusQueries.topStates(reqData, (documents) => {
        res.json({states: documents,  query: reqData});
    });
});


/*
 *  Start import of census data.
 */
router.post('/census/import', function(req, res, next) {
    var importer = require('../importers/census-import');
    importer.import();
    res.json({importing: true});
});

/*
 *  Status of import of census data.
 */
router.get('/census/import/status', function(req, res, next) {
    var importer = require('../importers/census-import');
    res.json({importing: importer.inProgress()});
});



/*
 *  Start import of complaints data.
 */
router.post('/complaints/import', function(req, res, next) {
    var importer = require('../importers/consumer-complaints-import');
    importer.import();
    res.json({importing: true});
});

/*
 *  Status of import of complaints data.
 */
router.get('/complaints/import/status', function(req, res, next) {
    var importer = require('../importers/consumer-complaints-import');
    res.json({importing: importer.inProgress()});
});


module.exports = router;
