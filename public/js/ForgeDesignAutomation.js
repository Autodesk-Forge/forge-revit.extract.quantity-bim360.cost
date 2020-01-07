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


var budgetMgrInstance = null;

///////////////////////////////////////////////////////////////////////
/// Generate random color
///////////////////////////////////////////////////////////////////////
function random_rgba() {
  var o = Math.round, r = Math.random, s = 255;
  return 'rgba(' + o(r() * s) + ',' + o(r() * s) + ',' + o(r() * s) + ',' + 0.5 + ')';
}



///////////////////////////////////////////////////////////////////////
/// Class to handle PriceBook database
///////////////////////////////////////////////////////////////////////
class PriceBook {
  constructor() {
    this.priceBookUrl = '/api/forge/bim360/v1/pricebook';
    this.priceInfo = [];
  }

  async initPriceBook() {
    try {
      this.priceInfo = await getDataClientAsync(this.priceBookUrl);
    } catch (err) {
      console.error(err);
      this.priceInfo = null;
    }
  }

  getPriceInfoForElement(elementName) {
    for (let key in this.priceInfo) {
      if (this.priceInfo[key].Type === elementName) {
        return this.priceInfo[key];
      }
    }
    return null;
  }

  async updatePriceBook(budgetCode, unitPrice) {
    const requestBody = {
      budgetCode: budgetCode,
      unitPrice: unitPrice
    };
    try {
      const priceBookRes = await postDataClientAsync(this.priceBookUrl, requestBody);
    } catch (err) {
      console.log(err);
      return false;
    }
    return true;
  }
}


///////////////////////////////////////////////////////////////////////
/// Class to handle Budget Chart
///////////////////////////////////////////////////////////////////////
class BudgetChart {

  static budgetStatisticChartTitle = 'Budget Statistic';

  constructor(chartId, dataSet = []) {
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
          text: BudgetChart.budgetStatisticChartTitle
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

  refreshChart(dataSet) {
    if (this.chart === null) {
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
class BudgetTable {

  static Budget_Table_Columns = [
    { title: "Element" },
    { title: "Code" },
    { title: "Quantity" },
    { title: "Unit" },
    { title: "Unit Price($)" },
    { title: "Amount($)" }
  ];

  constructor(tableId, dataSet = []) {
    this.tableId = tableId;
    this.table = $(tableId).DataTable({
      pageLength: 10,
      data: dataSet,
      columns: BudgetTable.Budget_Table_Columns
    });
  }

  refreshTable(dataSet = null) {
    if (this.table === null) {
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
          name: budgetItem[0],
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

  updateBudgetsTable(budgetCode, unitPrice, amount) {
    if (this.table !== null) {
      let tableData = this.table.data();
      const budgetCount = tableData.length;
      // reset the data
      for (let i = 0; i < budgetCount; ++i) {
        if (tableData[i][1] === budgetCode) {
          tableData[i][4] = unitPrice;
          tableData[i][5] = amount;
          break;
        }
      }
    }
  }
}

///////////////////////////////////////////////////////////////////////
/// Class to manage the operation to budget
///////////////////////////////////////////////////////////////////////
class BudgetManager {
  static SOCKET_TOPIC_WORKITEM = 'Workitem-Notification';

  constructor() {
    this.currentModelNode = null;
    this.costContainerId = null;

    this.quantityInfo = null;
    this.workingItem = null;

    this.drawTableCallback = null;

    // initialize the charts, table and price book
    this.budgetChart = new BudgetChart('budgetStatisticChart')
    this.budgetTable = new BudgetTable('#priceBookTable');
    this.priceBook = new PriceBook();

    this.socketio = io();
  }

  get BudgetChart() {
    return this.budgetChart;
  }

  get BudgetTable() {
    return this.budgetTable;
  }

  // start listen to the server
  connectToServer() {
    if (this.socketio) {
      this.socketio.on(BudgetManager.SOCKET_TOPIC_WORKITEM, this.handleSocketEvent.bind(this));
    }
  }

  // handle the events sent from server
  async handleSocketEvent(data) {
    if (this.workingItem === null || data.WorkitemId !== this.workingItem)
      return;

    const status = data.Status.toLowerCase();
    // enable the create button and refresh the hubs when completed/failed/cancelled
    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      this.workingItem = null;
    }
    if (status === 'completed' && this.currentModelNode != null) {
      console.log('Parameters are handled');

      let bar_labels = [];
      let bar_elementBudget = [];
      let bar_colors = [];

      let table_dataSet = [];
      const elementInfo = data.ExtraInfo;
      for (let elementKey in elementInfo) {
        if (elementKey === 'workitem')
          continue;

        bar_labels.push(elementKey);
        const elementPriceInfo = this.priceBook.getPriceInfoForElement(elementKey);
        if(elementPriceInfo == null){
          console.error("can not find the price info for element: " + elementKey);
          continue;
        }
        const unitPrice = elementPriceInfo['Price'];
        const elementCount = elementInfo[elementKey];
        const elementBudget = elementCount * unitPrice;

        bar_elementBudget.push(elementBudget);
        bar_colors.push(random_rgba());

        table_dataSet.push([elementKey, elementPriceInfo['Code'], elementCount, elementPriceInfo['Unit'], unitPrice, elementBudget]);
      }
      this.budgetTable.refreshTable(table_dataSet);

      const bar_budgetsData = {
        datasets: [{
          data: bar_elementBudget,
          backgroundColor: bar_colors
        }],
        labels: bar_labels
      };
      this.budgetChart.refreshChart(bar_budgetsData)

      this.currentModelNode = null;
    }

    if (this.drawTableCallback)
      this.drawTableCallback();
  }


  // initialize the information of current project, including selected node and and project
  async initBudgetMgr(modelNode, costContainerId) {
    if (modelNode && costContainerId) {
      this.currentModelNode = modelNode;
      this.costContainerId = costContainerId;
    }
    await this.priceBook.initPriceBook();
  }


  // extract quantity inforamtion based on the current revit project
  async extractQuantityInfo(drawTableCallback) {
    this.drawTableCallback = drawTableCallback;
    const inputJson = {
      walls: true,
      floors: true,
      doors: true,
      windows: true
    };
    try {
      const requestUrl = '/api/forge/da4revit/v1/revit/' + encodeURIComponent(this.currentModelNode.storage) + '/qto';
      this.quantityInfo = await getDataClientAsync(requestUrl, inputJson);
      this.workingItem = this.quantityInfo.workItemId;
      return true;
    } catch (err) {
      this.quantityInfo = null;
      this.workingItem = null;
      return false;
    }
  }

  // update the current budgets information to BIM 360 Cost Management module
  async updateToBIM360() {
    if (!this.budgetTable)
      return false;

    const budgetData = this.budgetTable.getBudgetList();
    const budgetBody = {
      data: budgetData,
      append: false
    }
    try {
      const requestUrl = '/api/forge/da4revit/v1/bim360/budgets';
      const requestBody = {
        cost_container_id: this.costContainerId,
        data: budgetBody
      };
      const result = await postDataClientAsync(requestUrl, requestBody);
      console.log(result);
      return true;
    } catch (err) {
      console.log('Failed to import budgets');
      return false;
    }
  }

  // get unit price from BIM 360 Cost Management module
  async getUnitPriceFromBIM360() {
    if (!this.costContainerId)
      return false;

    let budgetsRes = null;
    const requestUrl = '/api/forge/bim360/v1/projects/' + encodeURIComponent(this.costContainerId) + '/budgets';
    try {
      budgetsRes = await getDataClientAsync(requestUrl);
    } catch (err) {
      console.log(err);
      return false;
    }
    let budgetArray = [];
    let budgetLabel = [];
    await Promise.all(
      budgetsRes.map(async (budgetItem) => {
        const status = await this.priceBook.updatePriceBook(budgetItem['code'], budgetItem['unitPrice']);
        if (status) {
          budgetLabel.push(budgetItem['name']);
          budgetArray.push(budgetItem['unitPrice'] * budgetItem['quantity'])
          this.budgetTable.updateBudgetsTable(budgetItem['code'], budgetItem['unitPrice'], budgetItem['unitPrice'] * budgetItem['quantity']);
        }
      })
    )
    this.budgetTable.refreshTable();

    this.budgetChart.chart.data.datasets[0].data = budgetArray;
    this.budgetChart.chart.data.labels = budgetLabel;
    this.budgetChart.refreshChart(this.budgetChart.chart.data);
    return true;
  }
}

///////////////////////////////////////////////////////////////////////
/// Document ready event
///////////////////////////////////////////////////////////////////////
$(document).ready(function () {
  $('#extractQuantityInfo').click(extractQuantityInfoHandler);
  $('#updateToBIM360Btn').click(updateToBIM360Handler);
  $('#unitPriceFromBIM360Btn').click(getUnitPriceFromBIM360Handler);
 
  budgetMgrInstance = new BudgetManager();
  budgetMgrInstance.connectToServer();
});

///////////////////////////////////////////////////////////////////////
/// Event to start extracting the Quantity informaiton from model
///////////////////////////////////////////////////////////////////////
async function extractQuantityInfoHandler() {
    const instanceTree = $('#sourceHubs').jstree(true);
    if( instanceTree == null ){
        alert('Can not get the user hub');
        return;
    }
    const sourceNode = instanceTree.get_selected(true)[0];
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
    const projectHref = $('#labelProjectHref').text();
    const costContainerId = $('#labelCostContainer').text();
    if (projectHref === '' || costContainerId === '') {
      alert('please select one Revit project!');
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


    await budgetMgrInstance.initBudgetMgr( sourceNode.original, costContainerId );
    let result = await budgetMgrInstance.extractQuantityInfo( ()=>{
      $('.clsInProgress').hide();
      $('.clsResult').show();
      $('#updateToBIM360Btn')[0].disabled = false;
      $('#unitPriceFromBIM360Btn')[0].disabled = false;
    });
    if(!result){
      console.log('Failed to handle the parameters');
      $('.clsInProgress').hide();
      $('.clsResult').show();
    }
  return;
}

///////////////////////////////////////////////////////////////////////
/// Event to update the budgets info to BIM360 Cost module
///////////////////////////////////////////////////////////////////////
async function updateToBIM360Handler() {
  $('.clsUpdatingBIM360').show();
  $('#updateToBIM360Btn')[0].disabled = true;

  if ( budgetMgrInstance ==null ) {
    alert('budget table is not initialized.');
    return;
  }
  const result = await budgetMgrInstance.updateToBIM360();
  if( result ){
    alert('Budgets are imported to BIM360 Cost Module.')
  }else{
    alert('Failed to imported Budgets to BIM360 Cost Module.')
  }

  $('.clsUpdatingBIM360').hide();
  $('#updateToBIM360Btn')[0].disabled = false;

  return;
}

///////////////////////////////////////////////////////////////////////
/// Event to get unit price from BIM360 Cost module
///////////////////////////////////////////////////////////////////////
async function getUnitPriceFromBIM360Handler() {
  $('.clsUpdatingBIM360').show();
  $('#unitPriceFromBIM360Btn')[0].disabled = true;

  const result = await budgetMgrInstance.getUnitPriceFromBIM360();
  if( result ){
    console.log('Unit Price are imported from BIM360 Cost Module.')
  }else{
    console.log('Failed to imported Unit Price from BIM360 Cost Module.')
  }

  $('.clsUpdatingBIM360').hide();
  $('#unitPriceFromBIM360Btn')[0].disabled = false;
}


// helper function for GET Request
function getDataClientAsync(requestUrl, requestData=null) {
  let def = $.Deferred();

  jQuery.ajax({
    url: requestUrl,
    contentType: 'application/json',
    type: 'GET',
    dataType: 'json',
    data: requestData,
    success: function (res) {
      def.resolve(res);
    },
    error: function (err) {
      console.log('get cost info failed:');
      def.reject(err)
    }
  });
  return def.promise();
}

// helper function for POST Request
function postDataClientAsync(requestUrl, requestBody) {
  let def = $.Deferred();

  jQuery.post({
    url: requestUrl,
    contentType: 'application/json',
    dataType: 'json',
    data: JSON.stringify(requestBody),
    success: function (res) {
      def.resolve(res);
    },
    error: function (err) {
      console.log('post request failed:');
      def.reject(err)
    }
  });

  return def.promise();
}
