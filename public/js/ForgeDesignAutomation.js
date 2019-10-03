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

// TBD: move this to cloud database
var Standard_Book = {
  'Concrete': {
    'Price': 146,
    'Unit': 'm3',
    'Code': '200420420847'
  },
  'Window' : {
    'Price': 1224,
    'Unit': 'nr',
    'Code': '200420420857'
  },
  'Door' : {
    'Price': 1836,
    'Unit': 'nr',
    'Code': '200420420867'
  },
  'Floor' : {
    'Price': 80,
    'Unit': 'm2',
    'Code': '200420420877'
  }
} 

const Budget_Table_Columns = [
  { title: "Element" },
  { title: "Code" },
  { title: "Quantity" },
  { title: "Unit" },
  { title: "Unit Price($)" },
  { title: "Amount($)" }
];

const budgetStatisticChartTitle = 'Budget Statistic';

var budgetChart = null;
var budgetTable = null;

///////////////////////////////////////////////////////////////////////
/// Generate random color
///////////////////////////////////////////////////////////////////////
function random_rgba() {
  var o = Math.round, r = Math.random, s = 255;
  return 'rgba(' + o(r() * s) + ',' + o(r() * s) + ',' + o(r() * s) + ',' + 0.5 + ')';
}


///////////////////////////////////////////////////////////////////////
/// Update the standard book, TBD: move to database
///////////////////////////////////////////////////////////////////////
function updateStandarBook( budgetCode, unitPrice ){
  for( var item in Standard_Book){
    if( Standard_Book[item]['Code'] === budgetCode ){
      Standard_Book[item]['Price'] = unitPrice;
    }
  }
}


///////////////////////////////////////////////////////////////////////
/// Event to handle io socket message 
///////////////////////////////////////////////////////////////////////
function handleSocketEvent( data ){
  if(workingItem === null || data.WorkitemId !== workingItem)
    return;
    
  const status = data.Status.toLowerCase();

  // enable the create button and refresh the hubs when completed/failed/cancelled
  if(status === 'completed' || status === 'failed' || status === 'cancelled'){
    workingItem = null;
  }
  if(status === 'completed' && sourceNode != null){
    console.log('Parameters are handled');

    let bar_labels        = [];
    let bar_elementBudget = [];
    let bar_colors        = [];

    let table_dataSet     = [];
    const elementInfo = data.ExtraInfo;
    for(let elementKey in elementInfo){  
      if (elementKey === 'workitem' )
        continue;

      bar_labels.push(elementKey);

      const unitPrice = Standard_Book[elementKey]['Price'];
      const elementCount = elementInfo[elementKey];
      const elementBudget = elementCount * unitPrice;

      bar_elementBudget.push(elementBudget);
      bar_colors.push(random_rgba());

      table_dataSet.push( [ elementKey, Standard_Book[elementKey]['Code'], elementCount, Standard_Book[elementKey]['Unit'], unitPrice, elementBudget ] );
    }
    budgetTable.refreshTable( table_dataSet );

    const bar_budgetsData = {
      datasets: [{
        data: bar_elementBudget,
        backgroundColor: bar_colors
      }],
      labels: bar_labels
    };  
    budgetChart.refreshChart(bar_budgetsData)
    
    sourceNode = null;
  }
  $('.clsInProgress').hide();
  $('.clsResult').show();
  $('#updateToBIM360Btn')[0].disabled = false;
  $('#unitPriceFromBIM360Btn')[0].disabled = false;
}

///////////////////////////////////////////////////////////////////////
/// Class to handle Budget Chart
///////////////////////////////////////////////////////////////////////
class BudgetChart{

  constructor( chartId,  title, dataSet=[] ) {
    this.budgets = dataSet;

    var canvas = document.getElementById(chartId);
    var ctx = canvas.getContext('2d'); 
    
    this.chart = new Chart(ctx, {
      type: 'bar',
      data: dataSet,
      options: {
        scales: {
          yAxes: [{
            ticks: {
              beginAtZero: true
            }
          }]
        },
        responsive: true,
        maintainAspectRatio: true,
        title: {
          display: true,
          text: title
        },
        tooltips: {
          mode: 'index',
          intersect: true
        },
        legend: {
          display: false
        }
      }
    });
    this.chart.update();  
  }

  refreshChart(dataSet){
    if(this.chart === null){
      console.log('Chart is not initialized.');
      return;
    }
    this.chart.data = dataSet;
    this.chart.update();
  }
}

///////////////////////////////////////////////////////////////////////
/// Class to handle budget table
///////////////////////////////////////////////////////////////////////
class BudgetTable{

  constructor( tableId, columns, dataSet=[] ) {
    this.tableId = tableId;
    this.table = $(tableId).DataTable({
      pageLength: 10,
      data: dataSet,
      columns: columns
    });
  }

  refreshTable( dataSet = null){
    if(this.table === null){
      console.log('The table is not initialized, please re-check');
      return;
    }
    const newData = dataSet ? dataSet : this.table.data();
    this.table.clear().rows.add(newData).draw();
  }


  getBudgetList() {
    var budgetData = [];
    if (this.table !== null) {
      this.table.data().toArray().forEach((budgetItem) => {
        const item = {
          parentId: null,
          code: budgetItem[1],
          name: budgetItem[0] + ' Budget',
          quantity: budgetItem[2],
          description: "",
          unit: budgetItem[3],
          unitPrice: budgetItem[4].toString()
        }
        budgetData.push(item);
      })
    }
    return budgetData;
  }

  updateBudgetsTable( budgetCode, unitPrice, amount ){
    if (this.table !== null){
      let tableData = this.table.data();
      const budgetCount = tableData.length; 
      // reset the data
      for( let i = 0; i < budgetCount; ++i ){
        if(tableData[i][1] === budgetCode){
          tableData[i][4] = unitPrice;
          tableData[i][5] = amount;
          break;
        }
      }
    }
  }  
}



///////////////////////////////////////////////////////////////////////
/// Document ready event
///////////////////////////////////////////////////////////////////////
$(document).ready(function () {

  $('#extractQuantityInfo').click(extractQuantityInfo);
  $('#updateToBIM360Btn').click(updateToBIM360);
  $('#unitPriceFromBIM360Btn').click(getUnitPriceFromBIM360);
 
  // initialize the charts and table
  budgetChart = new BudgetChart( 'budgetStatisticChart',budgetStatisticChartTitle )
  budgetTable = new BudgetTable('#priceBookTable', Budget_Table_Columns );
});

var sourceNode  = null;
var workingItem = null;


const SOCKET_TOPIC_WORKITEM = 'Workitem-Notification';
socketio = io();
socketio.on(SOCKET_TOPIC_WORKITEM, handleSocketEvent)


///////////////////////////////////////////////////////////////////////
/// Event to start extracting the Quantity informaiton from model
///////////////////////////////////////////////////////////////////////
async function extractQuantityInfo() {
    const instanceTree = $('#sourceHubs').jstree(true);
    if( instanceTree == null ){
        alert('Can not get the user hub');
        return;
    }

    sourceNode = instanceTree.get_selected(true)[0];
    // use == here because sourceNode may be undefined or null
    if (sourceNode == null || sourceNode.type !== 'versions' ) {
        alert('Can not get the selected file, please make sure you select a version as input');
        return;
    }

    const fileName = instanceTree.get_text(sourceNode.parent);
    const fileNameParams = fileName.split('.');
    if( fileNameParams[fileNameParams.length-1].toLowerCase() !== "rvt"){
        alert('please select Revit project and try again');
        return;
    }

    if( sourceNode.original.storage == null){
        alert('Can not get the storage of the version');
        return;
    }

    // Start to work.
    $('.clsInProgress').show();
    $('.clsResult').hide();
    $('#updateToBIM360Btn')[0].disabled = true;
    $('#unitPriceFromBIM360Btn')[0].disabled = true;


    const inputJson = { 
        walls : true,    
        floors : true,
        doors   : true,
        windows : true
      };

      
  try {
    let res = null;
    res = await extractQuantityInfoImp(sourceNode.original.storage, inputJson);
    console.log('The parameters are exported');
    console.log(res);
    workingItem = res.workItemId;
  } catch (err) {
    console.log('Failed to handle the parameters');
    $('.clsInProgress').hide();
    $('.clsResult').show();
  }
  return;
}

///////////////////////////////////////////////////////////////////////
/// Event to update the budgets info to BIM360 Cost module
///////////////////////////////////////////////////////////////////////
async function updateToBIM360() {

  $('.clsUpdatingBIM360').show();
  $('#updateToBIM360Btn')[0].disabled = true;

  if (budgetTable === null) {
    alert('budget table is not initialized.');
    return;
  }

  const budgetData = budgetTable.getBudgetList();
  const budgetBody = {
    data: budgetData,
    append: true
  }

  try {
    let res = null;
    res = await updateToBIM360Imp(budgetBody);
    console.log(res);
    alert('Budgets are imported to BIM360 Cost Module.')
  } catch (err) {
    console.log('Failed to import budgets');
    alert('Failed to imported Budgets to BIM360 Cost Module.')
  }
  $('.clsUpdatingBIM360').hide();
  $('#updateToBIM360Btn')[0].disabled = false;

  return;
}

///////////////////////////////////////////////////////////////////////
/// Event to get unit price from BIM360 Cost module
///////////////////////////////////////////////////////////////////////
async function getUnitPriceFromBIM360() {

  let sourceNode = $('#sourceHubs').jstree(true).get_selected(true)[0];
  if (sourceNode === null) {
    alert('Please select in a project that you can get the Unit Price from');
    return;
  }

  $('.clsUpdatingBIM360').show();
  $('#unitPriceFromBIM360Btn')[0].disabled = true;

  //get all the budgets from BIM360 Cost module
  // TBD, get the container id first.

  try {
    const budgetsRes = await getBudgetsFromBIM360Imp('fakeonefornow');

    let budgetArray = [];
    budgetsRes.forEach(async (budgetItem) => {
      console.log(budgetItem);
      updateStandarBook(budgetItem['code'], budgetItem['unitPrice']);
      budgetArray.push(budgetItem['unitPrice'] * budgetItem['quantity'])
      budgetTable.updateBudgetsTable(budgetItem['code'], budgetItem['unitPrice'], budgetItem['unitPrice'] * budgetItem['quantity']);
    })
    budgetTable.refreshTable();

    budgetChart.chart.data.datasets[0].data = budgetArray;
    budgetChart.refreshChart(budgetChart.chart.data);
  }
  catch (err) {
    console.log(err);
  }

  $('.clsUpdatingBIM360').hide();
  $('#unitPriceFromBIM360Btn')[0].disabled = false;
}


///////////////////////////////////////////////////////////////////////
/// Implementation of extracting quantity informaiton
///////////////////////////////////////////////////////////////////////
async function extractQuantityInfoImp(inputRvt, inputJson) {
  let def = $.Deferred();

  jQuery.get({
    url: '/api/forge/da4revit/v1/revit/' + encodeURIComponent(inputRvt) + '/qto',
    contentType: 'application/json', // The data type was sent
    dataType: 'json', // The data type will be received
    data: inputJson,
    success: function (res) {
      def.resolve(res);
    },
    error: function (err) {
      def.reject(err);
    }
  });
  return def.promise();
}


///////////////////////////////////////////////////////////////////////
/// Implementation of updating budgets info in BIM360 Cost module
///////////////////////////////////////////////////////////////////////
async function updateToBIM360Imp( inputJson){
  let def = $.Deferred();

  jQuery.post({
      url: '/api/forge/da4revit/v1/bim360/budgets',
      contentType: 'application/json',
      dataType: 'json', 
      data: JSON.stringify(inputJson),
      success: function (res) {
          def.resolve(res);
      },
      error: function (err) {
          def.reject(err);
      }
  });

  return def.promise();
}


///////////////////////////////////////////////////////////////////////
/// Implementation of get budgets info from BIM360 Cost module
///////////////////////////////////////////////////////////////////////
async function getBudgetsFromBIM360Imp( project_id){
  let def = $.Deferred();

  jQuery.get({
      url: '/api/forge/bim360/v1/projects/' + encodeURIComponent(project_id) +'/budgets',
      dataType: 'json', 
      success: function (res) {
          def.resolve(res);
      },
      error: function (err) {
          def.reject(err);
      }
  });

  return def.promise();
}