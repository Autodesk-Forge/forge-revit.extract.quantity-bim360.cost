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

const express = require('express');
const { bim360Cost }= require('../config');

const { OAuth } = require('./common/oauthImp');

const { 
    apiClientCallAsync
} = require('./common/bim360costImp')


let router = express.Router();


// /////////////////////////////////////////////////////////////////////
// / Import budgets to BIM360 Cost module
// /////////////////////////////////////////////////////////////////////
router.post('/da4revit/v1/bim360/budgets', async (req, res, next) => {
    const cost_container_id = req.body.cost_container_id;
    const budgetList  = req.body.data; // input Url of Excel file
    if ( budgetList === '' ) {
        res.status(400).end('Missing input body');
        return;
    }
    try {
        const oauth = new OAuth(req.session);
        const internalToken = await oauth.getInternalToken();

        const importBudgetsUrl =  bim360Cost.URL.IMPORT_BUDGETS_URL.format(cost_container_id);

        const budgetsRes = await apiClientCallAsync( 'POST',  importBudgetsUrl, internalToken.access_token, budgetList);
        res.status(200).end(JSON.stringify(budgetsRes.body));
    } catch (err) {
        res.status(500).end("error");
    }
});


// /////////////////////////////////////////////////////////////////////
// / Import budgets to BIM360 Cost module
// /////////////////////////////////////////////////////////////////////
router.get('/bim360/v1/projects/:cost_container_id/budgets', async (req, res, next) => {

    const cost_container_id = req.params.cost_container_id;
    if ( cost_container_id === '' ) {
        res.status(400).end('Missing input project id');
        return;
    }

    try {
        const oauth = new OAuth(req.session);
        const internalToken = await oauth.getInternalToken();

        const budgetsUrl =  bim360Cost.URL.BUDGETS_RUL.format(cost_container_id);

        const budgetsRes = await apiClientCallAsync( 'GET',  budgetsUrl, internalToken.access_token);
        res.status(200).end(JSON.stringify(budgetsRes.body.results));
    } catch (err) {
        res.status(500).end("error");
    }
});


module.exports = router;
