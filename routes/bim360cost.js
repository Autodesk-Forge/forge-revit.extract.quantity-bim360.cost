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
const { bim360Cost, database }= require('../config');
const { OAuth } = require('./common/oauthImp');
const { apiClientCallAsync } = require('./common/apiclient');
const MongoClient = require('mongodb').MongoClient;

let router = express.Router();

// Sample price book database, you can create complex database per your request
const price_Book = [
    {
        "Type": "Concrete",
        "Price": 146,
        "Unit": "m3",
        "Code": "200420420847"

    }, {
        "Type": "Window",
        "Price": 1224,
        "Unit": "nr",
        "Code": "200420420857"
    }, {
        "Type": "Door",
        "Price": 1836,
        "Unit": "nr",
        "Code": "200420420867"

    }, {
        "Type": "Floor",
        "Price": 80,
        "Unit": "m2",
        "Code": "200420420877"
    }
]

var mongoClient = new MongoClient(database.url, { useNewUrlParser: true, useUnifiedTopology: true });

///////////////////////////////////////////////////////////////////////
/// Middleware for obtaining a token for each request.
///////////////////////////////////////////////////////////////////////
router.use(async (req, res, next) => {
    const oauth = new OAuth(req.session);
    req.oauth_token = await oauth.getInternalToken();
    next();   
});


// reset the database
router.post('/bim360/v1/database', async (req, res, next) => {
    mongoClient.connect((err, db) => {
        if (err) {
            console.error(err);
            return (res.status(500).json({
                diagnostic: "failed to connect server"
            }));
        }
        let dbo = db.db("Standard_Book");

        dbo.collections(  (err, collections)=>{
            if (err) {
                console.error(err);
                return (res.status(500).json({
                    diagnostic: "failed to find existing collection"
                }));
            }
            const priceBook = collections.find( (item)=>{
                return item.collectionName == 'Price_Book';
            } )
            if( priceBook != null ){
                dbo.collection("Price_Book").drop( (err, delOk) => {
                    if (err) {
                        console.error(err);
                        return (res.status(500).json({
                            diagnostic: "failed to delete existing collection"
                        }));
                    }
                    dbo.createCollection("Price_Book", (err, collection) => {
                        if (err) {
                            console.error(err);
                            return (res.status(500).json({
                                diagnostic: "failed to create collection"
                            }));
                        }
            
                        collection.insertMany(price_Book, (err, docs) => {
                            if (err) {
                                console.error(err);
                                return (res.status(500).json({
                                    diagnostic: "failed to create collection"
                                }));
                            }
                            res.status(200).json(docs.ops);
                            return;
                            // TBD   mongoClient.close();
                        })
                    })
                })
            }else{
                dbo.createCollection("Price_Book", (err, collection) => {
                    if (err) {
                        console.error(err);
                        return (res.status(500).json({
                            diagnostic: "failed to create collection"
                        }));
                    }
        
                    collection.insertMany(price_Book, (err, docs) => {
                        if (err) {
                            console.error(err);
                            return (res.status(500).json({
                                diagnostic: "failed to create collection"
                            }));
                        }
                        res.status(200).json(docs.ops);
                        return;
                        // TBD   mongoClient.close();
                    })
                })   
            }
        } )
    });
})



/////////////////////////////////////////////////////////////////////
// Import budgets to BIM360 Cost module
/////////////////////////////////////////////////////////////////////
router.get('/bim360/v1/pricebook', async (req, res, next) => {
    mongoClient.connect((err) => {
        if (err) {
            console.error(err);
            return (res.status(500).json({
                diagnostic: "failed to connect server"
            }));
        }
        const collection = mongoClient.db("Standard_Book").collection("Price_Book");
        // perform actions on the collection object
        collection.find({}).toArray(function (err, docs) {
            if (err) {
                console.error(err);
                mongoClient.close();
                return (res.status(500).json({
                    diagnostic: "failed to find the items in collection"
                }));
            }
            res.status(200).json(docs.filter(item => { return (item != null) }));
            return;
            // TBD   mongoClient.close();
        });
    });
});



/////////////////////////////////////////////////////////////////////
// Update the price book in database
/////////////////////////////////////////////////////////////////////
router.post('/bim360/v1/pricebook', async (req, res, next) => {
    const requestBody = req.body;
    mongoClient.connect((err) => {
        if (err) {
            console.error(err);
            return (res.status(500).json({
                diagnostic: "failed to connect server"
            }));
        }
        const collection = mongoClient.db("Standard_Book").collection("Price_Book");
        // perform actions on the collection object
        collection.updateOne({ "Code": requestBody.budgetCode }, { $set: { "Price": requestBody.unitPrice } }, function (err, result) {
            if (err) {
                console.error(err);
                mongoClient.close();
                return (res.status(500).json({
                    diagnostic: "failed to update the items in collection"
                }));
            }
            res.status(200).json(result);
            return;
            // TBD   mongoClient.close();
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
