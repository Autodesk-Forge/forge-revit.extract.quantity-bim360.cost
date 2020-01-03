/////////////////////////////////////////////////////////////////////
// Copyright (c) Autodesk, Inc. All rights reserved
// Written by Forge Partner Development
//
// Permission to use, copy, modify, and distribute this software in
// object code form for any purpose and without fee is hereby granted,
// provided that the above copyright notice appears in all copies and
// that both that copyright notice and the limited warranty and
// restricted rights notice below appear in all supporting
// documentation.
//
// AUTODESK PROVIDES THIS PROGRAM "AS IS" AND WITH ALL FAULTS.
// AUTODESK SPECIFICALLY DISCLAIMS ANY IMPLIED WARRANTY OF
// MERCHANTABILITY OR FITNESS FOR A PARTICULAR USE.  AUTODESK, INC.
// DOES NOT WARRANT THAT THE OPERATION OF THE PROGRAM WILL BE
// UNINTERRUPTED OR ERROR FREE.
/////////////////////////////////////////////////////////////////////
'use strict';   

const express = require('express');
const { bim360Cost }= require('../config');
const { OAuth } = require('./common/oauthImp');
const { apiClientCallAsync } = require('./common/apiclient');

let router = express.Router();



const MongoClient = require('mongodb').MongoClient;
const uri = "mongodb+srv://forge-user:forge@myforgecluster-njl8m.mongodb.net/test?retryWrites=true&w=majority";
var client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });


///////////////////////////////////////////////////////////////////////
/// Middleware for obtaining a token for each request.
///////////////////////////////////////////////////////////////////////
router.use(async (req, res, next) => {
    const oauth = new OAuth(req.session);
    req.oauth_token = await oauth.getInternalToken();
    next();   
});




/////////////////////////////////////////////////////////////////////
// Import budgets to BIM360 Cost module
/////////////////////////////////////////////////////////////////////
router.get('/bim360/v1/pricebook', async (req, res, next) => {
    client.connect((err) => {
        if(err){
            console.error(err);
            return (res.status(500).json({
                diagnostic: "failed to connect Mongo DB"
            }));
        }
        const collection = client.db("Standard_Book").collection("Price_Book");
        // perform actions on the collection object
        collection.find({}).toArray(function(err, docs) {
            if (err) {
                console.error(err);
                client.close();
                return (res.status(500).json({
                    diagnostic: "failed to find the items in collection"
                }));
            }

          console.log("Found the following records");
          console.log(docs)
          const pricebook = docs.map( (item)=> {
              return (item.data)
          } )
          res.status(200).json(pricebook.filter( item => { return (item!=null)}));
        //   client.close();
        });

      });
      
});


// /////////////////////////////////////////////////////////////////////
// / Get budgets info from BIM360 Cost module
// /////////////////////////////////////////////////////////////////////
router.get('/bim360/v1/projects/:cost_container_id/budgets', async (req, res, next) => {

    const cost_container_id = req.params.cost_container_id;
    if ( cost_container_id === '' ) {
        return (res.status(400).json({
            diagnostic: 'Missing input cost container id'
        }));
    }
    const budgetsUrl =  bim360Cost.URL.BUDGETS_RUL.format(cost_container_id);
    let budgetsRes = null;
    try {
        budgetsRes = await apiClientCallAsync( 'GET',  budgetsUrl, req.oauth_token.access_token);
    } catch (err) {
        console.error(err);
        return (res.status(500).json({
			diagnostic: 'Failed to get budgets info from BIM 360 cost module'
        }));
    }
    return (res.status(200).json(budgetsRes.body.results));
});




// /////////////////////////////////////////////////////////////////////
// / Import budgets to BIM360 Cost module
// /////////////////////////////////////////////////////////////////////
router.post('/da4revit/v1/bim360/budgets', async (req, res, next) => {
    const cost_container_id = req.body.cost_container_id;
    const budgetList  = req.body.data; // input Url of Excel file
    if ( budgetList === '' ) {
        return (res.status(400).json({
            diagnostic: 'Missing input body info'
        }));
    }
    const importBudgetsUrl =  bim360Cost.URL.IMPORT_BUDGETS_URL.format(cost_container_id);
    let budgetsRes = null;
    try {
        budgetsRes = await apiClientCallAsync( 'POST',  importBudgetsUrl, req.oauth_token.access_token, budgetList);
    } catch (err) {
        console.error(err);
        return (res.status(500).json({
			diagnostic: 'Failed to import budgets into BIM 360 cost module'
        }));
    }
    return (res.status(200).json(budgetsRes.body));
});


module.exports = router;
