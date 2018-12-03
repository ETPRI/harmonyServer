/*

add/edit one node in a form - view Relations

input: label
       data is optional.  Add mode is used if data is not supplied
       navigate a graph -


       input: node ID

       match (a) where id(p)=0
       match (b) where id(a)=12
       create (a)-[:worksAt2 {}]->(b)
*/


class widgetDetails {
constructor(label, container, GUID, name, callerID, userRequest, standalone) { // Label: the type of node described. ID: the ID of the node. Container: Where to put it
    // DOM pointers to data that will change, just make place holders
    this.widgetDOM   = container;
    this.tableDOM    = {};
    this.tBodyDOM    = null;
    this.fieldPopup  = null;
    this.trashRow    = null;

    this.name                 = name;
    this.id                   = null; // will be filled in later
    this.GUID                 = GUID; // can't hurt to have this separate - makes it more consistent with mindmap and calendar
    this.callerID             = callerID;
    this.queryObject          = app.metaData.getNode(label);
    this.queryObjectName      = label;
    this.nodeLabel            = this.queryObject.nodeLabel;
    this.fields               = this.queryObject.fields;
    this.proposedFields       = this.queryObject.proposedFields;
    this.fieldsDisplayed      = this.queryObject.fieldsDisplayed;
    this.formFieldsDisplayed  = this.queryObject.formFieldsDisplayed;
    this.lastSaveFFD          = this.formFieldsDisplayed;
    this.orderBy              = this.queryObject.orderBy;
    this.newFields            = 0;
    this.hiddenFields         = 0;
    this.propFieldsNum        = 0;
    this.currentData          = null;
    this.savedData            = null;
    this.showHideFieldsButton = null;

    this.idWidget = app.idCounter;
    app.widgets[app.idCounter++] = this; // Add to app.widgets
    this.containedWidgets = [];

    // create popup
    this.fieldPopup = app.setUpPopup(this);

    // If we're editing, then the ID for the node was passed in.
    if (GUID) {
      const obj = {};
      obj.required = {"name":"n", "properties":{"M_GUID":GUID}};
      obj.optional = {"id":app.login.userID, "return":false};
      obj.rel = {"name":"r", "type":"Trash", "direction":"left"};// (n)<-[rel]-(a)

      if (!userRequest) {
        userRequest = app.REST.startUserRequest("Searching for node", this.widgetDOM);
      }

      app.REST.sendQuery(obj, "findOptionalRelation", "Searching for node", userRequest, this.widgetDOM, null, null, this.finishConstructor.bind(this));
    }
    else { // If no ID was passed in
       this.finishConstructor();
     }
  }

finishConstructor(data, userRequest) {
  if (data) { // If data were passed in, add them to the table, and set this.id
    this.id = data[0].n.id;
    this.GUID = data[0].n.properties.M_GUID;
    for (let prop in data[0].n.properties) {
      // strings can stay strings and numbers are already stored as numbers.
      // Anything else was stored as a string and needs to be parsed.
      let type = app.getProp(this.fields, prop, "type");
      if (type && type !== "string" && type !== "number") {
        data[0].n.properties[prop] = JSON.parse(data[0].n.properties[prop]);
      }
    }

    this.savedData = data[0].n;
    this.currentData = JSON.parse(JSON.stringify(this.savedData)); // makes a copy

    const obj = {};
    obj.data = JSON.parse(JSON.stringify(data));
    app.stripIDs(obj.data);
    app.regression.log(JSON.stringify(obj));
    app.regression.record(obj);
  }

  else if (this.name) { // if no actual node was opened, but a name was specified, then at least store that.
    this.currentData = {"properties":{"name":this.name}};
  }

  this.buildWidget();
  this.refresh();

  if (data) { // I hate to do this twice, but I have to create currentData and savedData before I can call buildWidget or refresh, and I have to call buildWidget before changing and using DOM elements.
    if (data[0].r) { // If a trash relation was returned (meaning that the node was already trashed by this user)...
      this.savedData.properties._trash=true;
      this.savedData.properties.reason = data[0].r.properties.reason; // Record in savedData that it was trashed already...
      const trashCheck = app.domFunctions.getChildByIdr(this.widgetDOM, "trashCheck");
      trashCheck.checked=true;

      const reason = app.domFunctions.getChildByIdr(this.widgetDOM, 'trashReason');
      const reasonText = app.domFunctions.getChildByIdr(this.widgetDOM, 'reasonText');      // Show the reason prompt and textbox...
      reason.removeAttribute("hidden");
      reasonText.removeAttribute("hidden");
      reason.setAttribute("value", data[0].r.properties.reason); // And prefill that textbox with the reason.
    }
    this.currentData = JSON.parse(JSON.stringify(this.savedData));

    // Check for an owner relation
    const obj = {};
    obj.from = {"id":this.id, "return":"false"};
    obj.rel = {"type":"Owner", "return":"false"};
    obj.to = {};

    app.REST.sendQuery(obj, "changeRelation", "Searching for owner", userRequest, this.widgetDOM, null, null, function(data) {
      if (data.length == 1) {
        this.owner = {"name":data[0].to.properties.name, "id":data[0].to.id, "GUID":data[0].to.properties.M_GUID};
      }
    }.bind(this));
  }
}

buildWidget() { // public - build table header
  // let id=null;  // assume add mode
  let name = "New Node";

  if (this.currentData) {
    // we are edit mode
    name = this.currentData.properties.name;
  }

  // Make the container a widget
  this.widgetDOM.classList.add("widget");
  this.widgetDOM.setAttribute("id", this.idWidget);
  const main = document.createElement('div');
  main.setAttribute('idr', 'main');
  this.widgetDOM.appendChild(main);

  // Create a table and append it to the container
  this.tableDOM = document.createElement('table');
  main.appendChild(this.tableDOM);
  this.tableDOM.setAttribute("idr", "nodeTable");
  this.tBodyDOM = document.createElement('tbody');
  this.tBodyDOM.setAttribute("idr", "nodeTBody");
  this.tableDOM.appendChild(this.tBodyDOM);

  this.widgetDOM.appendChild(this.fieldPopup);

  const button = document.createElement('input');
  this.widgetDOM.insertBefore(button, main);
  button.outerHTML = `<input type="button" value="Open as node" onclick="app.widget('showNode', this)">`;
  if (app.login.permissions === "Admin") { // Only admins can see metadata at all, so only they get the show change logs button
    const changeLogButton = document.createElement('input');
    this.widgetDOM.insertBefore(changeLogButton, main);
    changeLogButton.outerHTML = `<input type="button" value="Show Change Logs"
                        onclick="app.menuNodes('M_ChangeLog', [{name:'item_GUID', value:'${this.GUID}', dropDownValue:'='}])">`;
  }
  const dataBrowserButton = document.createElement('input');
  this.widgetDOM.insertBefore(dataBrowserButton, main);
  dataBrowserButton.outerHTML = `<input type="button" value="New Data Browser"
                      onclick="new dataBrowser('${this.GUID}')">`;

  const drag = document.createElement('b');
  this.widgetDOM.insertBefore(drag, main);
  drag.outerHTML = `<b idr = "dragButton" draggable=true ondragstart="app.widget('drag', this, event)">Drag To View</b>`;
}

showNode() {
  new widgetNode(this.idWidget, this.queryObjectName, this.GUID);
}

restoreSize(button) {
  const header = app.domFunctions.getChildByIdr(this.fieldPopup, 'popupHeader');
  const db = header.textContent;
  delete this.fields[db].input.height;
  delete this.fields[db].input.width;

  const textareas = Array.from(this.tBodyDOM.getElementsByTagName('textarea'));
  const textarea = textareas.filter(x=>x.getAttribute('db') == db)[0];

  if (textarea) {
    textarea.removeAttribute("style"); // removes the height and width settings
    if (this.fields[db].input && this.fields[db].input.rows) {
      textarea.rows = this.fields[db].input.rows;
    }
    if (this.fields[db].input && this.fields[db].input.cols) {
      textarea.cols = this.fields[db].input.cols;
    }
  }
}

refresh() {   // put in one field label and input row for each field - includes creating dragdrop table
  // Update this.name and the name stored in the widget list
  let thisName = app.getProp(this, "currentData", "properties", "name");
  if (thisName) {
    this.name = thisName;
    const widgetList = document.getElementById("widgetList");
    const entry = app.domFunctions.getChildByIdr(widgetList, this.idWidget);
    if (entry) {
      const entryName = app.domFunctions.getChildByIdr(entry, "name");
      entryName.innerHTML = thisName;
    }
  }
  let fieldCount = 0;
  this.hiddenFields = 0;
  this.propFieldsNum = 0;
  const newFields = [];

  // Clear any existing data. Also, if there are any new fields, check whether they've been saved
  // and store them as new fields if not (that is, if we're refreshing without saving)
  while (this.tBodyDOM.hasChildNodes()) {
    const row = this.tBodyDOM.removeChild(this.tBodyDOM.firstChild);
    const idr = row.getAttribute('idr');
    if (idr && idr.slice(0,11) === 'newFieldRow') { // If this row is a new field...
      const name = row.firstElementChild.firstElementChild.value; // and its name...
      if (name && !(name in this.fields) && !(name in this.proposedFields)) { // isn't in fields or proposedFields (meaning it hasn't been saved)...
        newFields[name] = row.lastElementChild.firstElementChild.value; // store it in newFields.
      }
    }
  }

  let table = this.tBodyDOM.parentElement;
  let parent = table.parentElement;
  while (table.nextElementSibling) {
    table.parentElement.removeChild(table.nextElementSibling);
  }

  for (let i = 0; i < this.formFieldsDisplayed.length; i++) {
    this.addRow(this.formFieldsDisplayed[i], fieldCount++);
  } // end for (every field to be displayed)

  for (let fieldName in this.fields) {
    if (this.formFieldsDisplayed.indexOf(fieldName) == -1) { // For every hidden field
      const row = this.addRow(fieldName, fieldCount++);
      row.setAttribute('class', 'notShown');
      row.hidden = true;
      this.hiddenFields++;
    }
  } // end for (every field in this.fields)

  const lastRow = this.tBodyDOM.lastElementChild;
  const lastIDR = lastRow.getAttribute('idr');
  this.containedWidgets.push(app.idCounter); // The dragDrop table will be a widget, so add it to the list of "widgets the widgetNode contains"
  // Create the new dragDrop table
  const dragDrop = new dragDropTable(null, "nodeTBody", this.widgetDOM, 0, 0);

  // NOTE: Can't stop dragDrop from creating inputs, so instead I'll reset the th idr at the end for now. Feels kludgy, though.
  // const lastRow = app.domFunctions.getChildByIdr(this.tableDOM, 'insertContainer', true);
  lastRow.setAttribute('idr', lastIDR);
  const th = lastRow.firstElementChild;
  th.setAttribute('idr', `th${th.getAttribute('db')}`);

  dragDrop.showPopup = this.showPopup.bind(this);
  dragDrop.changed = this.changed.bind(this);
  dragDrop.checkNewField = this.checkNewField.bind(this);
  dragDrop.checkDuplicateField = this.checkDuplicateField.bind(this);
  dragDrop.addField = this.addField.bind(this);

  // This stuff shouldn't be draggable, so put it in AFTER the dragdrop table is created

  const explnRow = document.createElement('tr');
  let newField = "Proposed";
  if (app.login.permissions === "Admin") {
    newField = "New";
  }
  explnRow.innerHTML = `<th><p>${newField} Fields</p></th><th><p>${newField} Field Descriptions</p></th>`;
  explnRow.setAttribute('idr', 'explnRow');
  this.tBodyDOM.appendChild(explnRow);

  for (let fieldName in newFields) {
    this.addField(fieldName, newFields[fieldName]);
  }

  if (this.proposedFields) {
    for (let fieldName in this.proposedFields) {
      const row = this.addRow(fieldName, fieldCount++, true);
      row.setAttribute('class', 'proposed');
      row.hidden = true;
      this.propFieldsNum++;
    }
  }


  // NOTE: Update the dragdrop drop method to include checking for reordering
  // const oldDrop = dragDrop.drop;
  // dragDrop.drop = function(input, evnt) {
  //   // Get array of fieldnames in current order
  //   // Array of fieldnames in last saved order is this.lastSaveFFD
  //   // Pass the array to app.createLIS along with a comparison function - this.lastSaveFFD.indexOf(a) - this.lastSaveFFD.indexOf(b)
  //   // Go through each row and if its name IS in lastSaveFFD, but ISN'T in the LIS, give it the changedData class.
  //   // If its name ISN'T in lastSaveFFD, give it the newData class.
  //
  //   oldDrop.apply(this, input, evnt);
  // }

  // Create 'Show All' button
  this.showHideFieldsButton = document.createElement("input");
  this.showHideFieldsButton.setAttribute('type', 'button');
  const mainCell = app.domFunctions.getChildByIdr(this.widgetDOM, 'main');
  mainCell.appendChild(this.showHideFieldsButton);
  if (this.hiddenFields == 0) {
    this.showHideFieldsButton.value = "Show Hidden Fields (0)";
    this.showHideFieldsButton.disabled = true;
  }
  else {
    this.showHideFieldsButton.value = `Show Hidden Fields (${this.hiddenFields})`;
    this.showHideFieldsButton.setAttribute('onclick', "app.widget('showHideAllFields', this)");
  }
  this.showHideFieldsButton.setAttribute('style', 'text-align:center');

  // Create "Show proposed fields" button
  this.showPropFieldsButton = document.createElement("input");
  this.showPropFieldsButton.setAttribute('type', 'button');
  mainCell.appendChild(this.showPropFieldsButton);
  if (this.propFieldsNum ==0) {
    this.showPropFieldsButton.value = "Show Proposed Fields (0)";
    this.showPropFieldsButton.disabled = true;
  }
  else {
    this.showPropFieldsButton.value = `Show Proposed Fields (${this.propFieldsNum})`;
    this.showPropFieldsButton.setAttribute('onclick', "app.widget('showHideProposedFields', this)");
  }
  this.showPropFieldsButton.setAttribute('style', 'text-align:center');

  const trashHTML = `<b>Trash Node</b>
                <input type="checkbox" onclick="app.widget('toggleReason', this)" idr="trashCheck">
                <b idr="reasonText" hidden="true">Reason: </b>
                <input type="text" hidden="true" onblur="app.widget('changed', this.parentElement)" idr="trashReason" db="reason">`;

  this.trashRow = document.createElement('div');
  mainCell.appendChild(this.trashRow);
  this.trashRow.innerHTML = trashHTML;

  if (this.currentData && this.currentData.properties._trash) {
    const checkbox = app.domFunctions.getChildByIdr(this.widgetDOM, 'trashCheck');
    const reason = app.domFunctions.getChildByIdr(this.widgetDOM, 'trashReason');
    const reasonText = app.domFunctions.getChildByIdr(this.widgetDOM, 'reasonText');
    checkbox.checked = true; // Check the box...
    reason.removeAttribute("hidden"); // Show the reason prompt and textbox...
    reasonText.removeAttribute("hidden");
    reason.setAttribute("value", this.currentData.properties.reason); // And prefill that textbox with the reason.
  }

  // set the button to be save or added
  if (this.addSaveDOM) {
    if (this.savedData) {
      this.addSaveDOM.value = "Save";
    }
    else {
      this.addSaveDOM.value = "Add";
    }
  }

  // Create new field box
  this.addField();
}

addRow(fieldName, fieldCount, proposed) {
  let value = "";

  // Create a table row (in dragDrop table - all "this" references in HTML are to dragDrop)
  const row = document.createElement('tr');
  if (proposed) {
    row.setAttribute('idr', `propRow${fieldName}`);
  }
  else {
    row.setAttribute('ondrop', "app.widget('drop', this, event)");
    row.setAttribute("ondragover", "event.preventDefault()");
    row.setAttribute('ondragstart', "app.widget('drag', this, event)");
    row.setAttribute('draggable', "true");
    row.setAttribute('idr', `tr${fieldName}`);
  }

  this.tBodyDOM.appendChild(row);

  // Create the first cell, a th cell containing the label as text. IF this is a proposed field AND the user is an admin, also show a checkbox.
  const header = document.createElement('th');
  row.appendChild(header);

  let label = "";
  let data = "";
  if (proposed) {
    label = this.proposedFields[fieldName].label;
    data = this.proposedFields[fieldName].description;
  }
  else {
    label = this.fields[fieldName].label;
    if (this.currentData) {
      const d=this.currentData.properties;
      data = d[fieldName];
      // if (typeof data === "string") { // No need to sanitize data that don't exist, and this can avoid errors when a value is undefined during testing
      //   data = data.replace(/"/g, "&quot;");
      // }
      if (data === null || data === undefined) {
        data = "";
      }

      else if (typeof data !== "string"){ // If actual data that is NOT a string, stringify it first
        data = JSON.stringify(data);
      }
    }
  } // end if (not a proposed field)

  if (proposed && app.login.permissions === "Admin") {
    const approve = document.createElement('input');
    header.appendChild(approve);
    approve.outerHTML = `<input type="checkbox" idr="approve_${fieldName}">`;
  }

  const labelText = document.createTextNode(label);
  header.appendChild(labelText);
  if (!proposed) { // proposed fields shouldn't get popups
    header.setAttribute('oncontextmenu', "event.preventDefault(); app.widget('showPopup', this)");
  }
  header.setAttribute('db', fieldName);
  header.setAttribute('idr', `th${fieldName}`);

  // Create the second cell, a td cell which will normally contain
  // an input which has an idr, an onChange event, and a value which may be an empty string
  // If this is a proposed field, or a non-editable field, the cell will just contain text instead.
  const dataField = document.createElement('td');
  row.appendChild(dataField);

  if (proposed || this.fields[fieldName].editable === false) {
    const textParagraph = document.createElement('p');
    const text = document.createTextNode(data);
    textParagraph.appendChild(text);
    dataField.appendChild(textParagraph);
  }

  else {
    let inputType = "input";
    if (this.fields[fieldName] && this.fields[fieldName].input && this.fields[fieldName].input.name) {
      inputType = this.fields[fieldName].input.name;
    }
    const input = document.createElement(inputType);

    if (inputType == "input" && this.fields[fieldName] && this.fields[fieldName].input && this.fields[fieldName].input.size) {
      input.setAttribute("size", this.fields[fieldName].input.size);
    }
    else if (inputType == "textarea") {
      let pixSize = false; // Pixel sizes, set by the user, overrule rows and columns set by default

      if (this.fields[fieldName] && this.fields[fieldName].input && this.fields[fieldName].input.height) {
        input.setAttribute("style", `height:${this.fields[fieldName].input.height}px; width:${this.fields[fieldName].input.width}px;`);
        pixSize = true;
      }

      if (!pixSize && this.fields[fieldName] && this.fields[fieldName].input && this.fields[fieldName].input.rows) {
        input.rows = this.fields[fieldName].input.rows;
      }
      if (!pixSize && this.fields[fieldName] && this.fields[fieldName].input && this.fields[fieldName].input.cols) {
        input.cols = this.fields[fieldName].input.cols;
      }
    }

    dataField.appendChild(input);

    input.setAttribute("db", fieldName);
    input.setAttribute("idr", `input${fieldCount}`);
    input.setAttribute("onchange", "app.widget('changed',this.parentElement, true)");
    input.value = data;
    input.setAttribute("onfocus", "this.parentNode.parentNode.draggable = false;");
    input.setAttribute("onblur", "this.parentNode.parentNode.draggable = true;");

  } // end if (not a proposed field)
  this.changed(dataField); // Check whether the new value is different from the saved version; highlight it if so

  return row;
}

showHideAllFields(button) {
  const hiddenFields = this.tBodyDOM.getElementsByClassName('notShown');
  switch(button.value.slice(0,6)) {
    case 'Show H': // 'Show Hidden'
      for (let i = 0; i < hiddenFields.length; i++) {
        hiddenFields[i].hidden = false;
      }
      button.value = "Show Less";
      break;
    case 'Show L': // 'Show Less'
    for (let i = 0; i < hiddenFields.length; i++) {
      hiddenFields[i].hidden = true;
    }
    button.value = `Show Hidden Fields (${hiddenFields.length})`;
    break;
  }
}

showHideProposedFields(button) {
  const hiddenFields = this.tBodyDOM.getElementsByClassName('proposed');
  switch(button.value.slice(0,4)) {
    case 'Show':
      for (let i = 0; i < hiddenFields.length; i++) {
        hiddenFields[i].hidden = false;
      }
      button.value = "Hide Proposed Fields";
      break;
    case 'Hide':
    for (let i = 0; i < hiddenFields.length; i++) {
      hiddenFields[i].hidden = true;
    }
    button.value = `Show Proposed Fields (${hiddenFields.length})`;
    break;
  }
}

checkDuplicateField(input) {
  let name = input.value;
  let label = "";
  // fieldName is the existing field name, if any, which is equal to the proposed name except for case
  const fieldName = Object.keys(this.fields).find(key => key.toLowerCase() === name.toLowerCase());
  const dupName = (fieldName !== undefined);
  if (dupName) {
    label = this.fields[fieldName].label;
    name = fieldName;
  }
  // dbName is the existing field name, if any, whose LABEL is equal to the proposed name except for case
  const dbName = Object.keys(this.fields).find(key => this.fields[key].label.toLowerCase() === name.toLowerCase());
  const dupLabel = (dbName !== undefined);
  if (dupLabel) {
    label = name;
    name = dbName;
  }

  // Now do the same thing for PROPOSED fields
  const propFieldName = Object.keys(this.proposedFields).find(key => key.toLowerCase() === name.toLowerCase());
  const dupPropName = (propFieldName !== undefined);
  if (dupPropName) {
    label = this.proposedFields[propFieldName].label;
    name = propFieldName;
  }

  const propDBName = Object.keys(this.proposedFields).find(key => this.proposedFields[key].label.toLowerCase() === name.toLowerCase());
  const dupPropLabel = (propDBName !== undefined);
  if (dupPropLabel) {
    label = name;
    name = propDBName;
  }

  // At this point, if the field exists, name is the DB name and label is the label

  if (dupName || dupLabel || dupPropName || dupPropLabel) { // If this is a duplicate fieldname or label
    // If this field is not currently displayed (because it's not in formFieldsDisplayed and hidden fields are hidden),
    // and the field is an existing field (not a proposed field)
    if (this.formFieldsDisplayed.indexOf(name) === -1 && this.showHideFieldsButton.value.slice(0,6) === "Show A" && (dupName || dupLabel)) {
      let text = "This field already exists, but is not displayed. Do you want to display it?";
      if (dupName && name !== label) {
        text = `This field already exists with the label ${label}, but is not displayed. Do you want to display it?`;
      }
      if (confirm(text)) {
        const row = app.domFunctions.getChildByIdr(this.widgetDOM, `tr${name}`, true);
        row.hidden = false;
        row.classList.remove("notShown");
        this.hiddenFields--;
        if (this.hiddenFields === 0) {
          this.showHideFieldsButton.value = `Show All (0)`;
          this.showHideFieldsButton.disabled = true;
        }
        else if (this.showHideFieldsButton.value.slice(0, 6) === "Show A") {
          this.showHideFieldsButton.value = `Show All (${this.hiddenFields})`;
        }
      } // end if (the user agrees to display the hidden field)
    } // end if (the field exists, but is hidden)
    else if (dupName || dupLabel) { // If the field is an existing (not proposed) field and is not hidden
      let text = "This field already exists. Please use the existing field or choose a new name.";
      if (dupName && name !== label) {
        text = `This field already exists with the label ${label}. Please use the existing field or choose a new name.`;
      }
      alert (text);
    } // end else if (the field exists and is NOT hidden)
    else { // If the field is a proposed field
      let text = "This field has already been proposed. Please wait for the existing field to be approved or choose a new name.";
      if (dupPropName && name !== label) {
        text = `This field has already been proposed with the label ${label}. Please wait for the existing field to be approved or choose a new name.`;
      }
      alert (text);
    }
    // Whether the field was hidden or not, whether the user agreed to display it or not, delete the text in this textbox
    input.value = "";
  } // end if (the fieldname exists)
}

checkNewField() {
  const rows = this.tBodyDOM.children;
  let add = true;
  for (let i = 0; i < rows.length; i++) {
    const idr = rows[i].getAttribute('idr');
    if (idr && idr.slice(0,11) == 'newFieldRow') { // This is a new field row
      const nameCell = rows[i].firstElementChild;
      const valueCell = nameCell.nextElementSibling;
      if (nameCell.firstElementChild.value == "" && valueCell.firstElementChild.value == "") { // both inputs are empty
        add = false;
        break;
      }
    }
  }
  // If all rows have been checked, and there are no empty ones, create a new one.
  if (add) {
    this.addField();
  }
}

addField(name, value) { // If name and value don't exist, we're adding a blank row - if they do, we're adding one with values
  if (!name) {
    name = "";
  }
  if (!value) {
    value = "";
  }
  const row = document.createElement('tr');
  row.setAttribute('idr', `newFieldRow${this.newFields}`);
  this.tBodyDOM.append(row);

  const nameCell = document.createElement('td');
  row.appendChild(nameCell);
  const nameIn = document.createElement('input');
  nameCell.appendChild(nameIn);
  nameIn.outerHTML = `<input type = "text" idr = "newFieldName${this.newFields}" onChange = "app.widget('changed',this.parentElement)" onblur = "app.widget('checkDuplicateField', this); app.widget('checkNewField', this)" value = "${name}">`

  const valueCell = document.createElement('td');
  row.appendChild(valueCell);
  const valueIn = document.createElement('input');
  valueCell.appendChild(valueIn);
  valueIn.outerHTML = `<input type = "text" idr = "newFieldValue${this.newFields++}" onChange = "app.widget('changed',this.parentElement)" onblur = "app.widget('checkNewField', this)" value = "${value}">`
}

saveAddMain(widgetElement, userRequest) {
  if (!userRequest) { // If no user request was specified, create one
    userRequest = app.REST.startUserRequest("Saving node", this.widgetDOM);
  }

  // If the button that was clicked was labeled "Add" (adding a new node) or this node belongs to someone else (making a new copy), we're adding
  let action = "Save";
  if ((widgetElement && widgetElement.value === "Add") || (this.owner && this.owner.id !== app.login.userID)) {
    action = "Add";
  }

  // Will call untrashNode, trashNode, or changeReason if needed, then resolve
  this.checkTrashPromise({"details":this, "app":app, "action":action, "userRequest":userRequest}) // Starting values for saveObj
  .then(this.savePromise) // Will actually save the node data; adds tempMetaData, newFields, propFieldsChanged and data to saveOBj
  .then(function(saveObj) {
    this.updateMetaDataPromise(saveObj) // Update the user's settings and the metadata fields; adds metaData to saveObj...
    .then(this.updateFieldsPromise);
    this.checkOwnerPromise(saveObj); // check whether the node needs a new owner and give it one if so...
    this.saveComplete(saveObj); // and simultaneously update saved data and refresh the widget.
  }.bind(this));
}

checkTrashPromise(saveObj) {
  return new Promise(function(resolve, reject) {
    const details = saveObj.details;
    const checkbox = saveObj.app.domFunctions.getChildByIdr(details.widgetDOM, "trashCheck");
    // If the node was trashed and now shouldn't be
    if (details.savedData && details.savedData.properties._trash === true && checkbox.checked === false) {
      details.untrashNodePromise(saveObj)
      .then(function() {
        resolve(saveObj);
      });
    }
    // If the node was not trashed and now should be. I used negation here, rather than checking for === false, because _trash could be undefined.
    else if (details.savedData && details.savedData.properties._trash !== true && checkbox.checked === true) {
      details.trashNodePromise(saveObj)
      .then(function() {
        resolve(saveObj);
      });
    }
    // If the node was and should stay trashed, but the reason has changed
    else if (details.savedData && details.savedData.properties._trash === true && checkbox.checked === true
      && saveObj.app.domFunctions.getChildByIdr(details.widgetDOM, 'trashReason').classList.contains("changedData")) {
      details.updateReasonPromise(saveObj)
      .then(function() {
        resolve(saveObj);
      });
    }
    // If the node's trash status isn't changing, only the data, go straight to the next step;
    else {
      resolve(saveObj);
    }
  });
}

untrashNodePromise(saveObj) {
  return new Promise(function(resolve, reject) {
    saveObj.details.savedData.properties._trash = false;
    const user = saveObj.app.login.userID;
    const node = saveObj.details.id;

    const obj = {};
    obj.from = {"id":user, "return":false};
    obj.to = {"id":node, "return":false};
    obj.rel = {"type":"Trash", "return":false};

    saveObj.app.REST.sendQuery(obj, "deleteRelation", "Restoring node", saveObj.userRequest, saveObj.details.widgetDOM, null, null, function() {
      resolve();
    });
  });
}

trashNodePromise(saveObj) {
  return new Promise(function(resolve, reject){
    saveObj.details.savedData.properties._trash = true;
    const user = saveObj.app.login.userID;
    const node = saveObj.details.id;
    const reasonInp = saveObj.app.domFunctions.getChildByIdr(saveObj.details.widgetDOM, 'trashReason');
    const reason = reasonInp.value;
    reasonInp.classList.remove("changedData"); // remove changedData class from reason

    const obj = {};
    obj.from = {"id":user, "return":false};
    obj.to = {"id":node, "return":false};
    obj.rel = {"type":"Trash", "merge":true, "properties":{"reason":saveObj.app.stringEscape(reason)}, "return":false};

    saveObj.app.REST.sendQuery(obj, "changeRelation", "Trashing node", saveObj.userRequest, saveObj.details.widgetDOM, null, null, function() {
      resolve();
    });
  });
}

updateReasonPromise(saveObj) {
  return new Promise(function(resolve, reject){
    const user = saveObj.app.login.userID;
    const node = saveObj.details.id;
    const reasonInp = saveObj.app.domFunctions.getChildByIdr(saveObj.details.widgetDOM, 'trashReason');
    const reason = reasonInp.value;
    saveObj.details.savedData.properties.reason = reason;
    reasonInp.classList.remove("changedData"); // remove changed data class from the reason textbox

    const obj = {};
    obj.from = {"id":user, "return":false};
    obj.to = {"id":node, "return":false};
    obj.rel = {"type":"Trash", "return":false};
    obj.changes = [{"item":"rel", "property":"reason", "value":saveObj.app.stringEscape(reason)}];

    saveObj.app.REST.sendQuery(obj, "changeRelation", "Updating reason", saveObj.userRequest, saveObj.details.widgetDOM, null, null, function(){
      resolve();
    });
  });
}

savePromise(saveObj) {
  return new Promise(function(resolve, reject){
    let details = saveObj.details;
    let app = saveObj.app;
    let userRequest = saveObj.userRequest;
    let action = saveObj.action;

    let propFieldsChanged = false;
    let tr = details.tBodyDOM.firstElementChild;

    let data = {}; // Data can be an object representing properties (for a new node) or an array of changes (for an existing one)
    if (action === "Save") {
      data = [];
    }

    let tempMetaData = {};
    const propertyNames = ['fieldsDisplayed', 'formFieldsDisplayed', 'nodeLabel', 'orderBy', 'fields'];
    for (let i = 0; i < propertyNames.length; i++) {
      tempMetaData[propertyNames[i]] = JSON.parse(JSON.stringify(details[propertyNames[i]]));
    } // make a copy of metadata

    let newFields = {};
    let reordered = false;
    let currentFields = [];

    const label = app.domFunctions.getChildByIdr(details.widgetDOM, 'nodeTypeLabel');
    const labelText = label.textContent;
    const renamed = (labelText !== tempMetaData.nodeLabel);
    if (renamed) { // update metadata nodeLabel object
      tempMetaData.nodeLabel = labelText;
    }

    /* goes through all rows - that is, all fields.
    If a row is new and the user is an admin, adds its name and description to fields and formFieldsDisplayed,
    and adds it to newFields and currentFields.
    If a row is new and the user is NOT an admin, just adds the name and description to proposedFields.
    If a row already existed, adds it to currentFields, saves the size if it's a textbox,
    and adds it to data if it's changed or the node is new.
    If a row is an existing proposed field, and the user is an admin, looks at whether the checkbox is checked.
    If so, adds to fields, formFieldsDisplayed, newFields and currentFields, just as if the admin added it.
    Also removes that field from proposedFields since it will now be an official field.
    */
    while (tr) {
      const dataCell = tr.lastElementChild;
      const dataInput = dataCell.firstElementChild; // find <input> element if it exists

      // Get the value of the attribute - the content of the cell for non-editable cells,
      // the value of the input for editable cells (which HAVE inputs)
      let value = dataCell.textContent;
      if (dataInput && (dataInput.tagName === 'INPUT' || dataInput.tagName === 'TEXTAREA')) {
        value = dataInput.value;
      }

      // process new fields
      const idr = tr.getAttribute('idr');
      if (idr && idr.slice(0,11) === "newFieldRow") {
        const nameCell = tr.firstElementChild;
        const name = nameCell.firstElementChild.value;
        const descCell = nameCell.nextElementSibling;
        const desc = descCell.firstElementChild.value;
        // If the field has been filled in, and that name didn't already exist, we can make it a new field
        if (name != "" && currentFields.indexOf(name) == -1) {
          // Remove spaces and parentheses to get a valid field name
          const fieldName = name.replace(/\s/g, "").replace(/\(/g, "").replace(/\)/g, "");

          if (app.login.permissions === "Admin") {
            // Add new fields to object.
            tempMetaData.fields[fieldName] = {"label": name, "description":desc};
            newFields[fieldName] = {"label": name, "description":desc};
            tempMetaData.formFieldsDisplayed.push(fieldName);
            currentFields.push(fieldName);
          }
          else {
            // Add new proposed fields to object. No other changes at this time.
            this.proposedFields[fieldName] = {"label": name, "description":desc};
            propFieldsChanged = true;
          }
        }
      }

      // process existing fields
      else if (idr && idr.slice(0,2) === 'tr') {
        const fieldName = idr.slice(2);
        currentFields.push(fieldName);

        if (app.getProp(tempMetaData, "fields", fieldName, "input", "name") === "textarea") {
          tempMetaData.fields[fieldName].input.height = dataInput.clientHeight
                                                    - parseInt(getComputedStyle(dataInput).getPropertyValue('padding-top'))
                                                    - parseInt(getComputedStyle(dataInput).getPropertyValue('padding-bottom'));
          tempMetaData.fields[fieldName].input.width = dataInput.clientWidth
                                                    - parseInt(getComputedStyle(dataInput).getPropertyValue('padding-left'))
                                                    - parseInt(getComputedStyle(dataInput).getPropertyValue('padding-right'));
        }

        // Add to data if we're saving and this field has been changed...
        if(action === "Save" && dataCell.classList.contains("changedData")) {
          // create a set for this field
          if (fieldName in tempMetaData.fields) {
            const change = {};
            change.property = fieldName;
            if (tempMetaData.fields[fieldName].type === "number") {
              change.value = value;
              change.string = false;
            }
            else if (value) {
              change.value = app.stringEscape(value);  // assume string
            }
            else {
              change.value = "";
            }
            data.push(change);
          }
        }

        // Add to data if we're adding and this field has any value at all
        else if (value && action === "Add") {
          data[fieldName] = app.stringEscape(value);
        }
      }

      // process proposed rows if the user is an admin (and may have approved some)
      else if (idr && idr.slice(0,7) === 'propRow' && app.login.permissions === "Admin") {
        const checkBox = tr.getElementsByTagName('input')[0]; // should be the only input in the row
        if (checkBox.checked) {
          const nameCell = tr.firstElementChild;
          const name = nameCell.textContent;
          const descCell = nameCell.nextElementSibling;
          const desc = descCell.textContent;
          if (name != "" && currentFields.indexOf(name) == -1) { // If the field has been filled in, and that name didn't already exist
            const fieldName = name.replace(/\s/g, "").replace(/\(/g, "").replace(/\)/g, "");

            // Add the field to the list of fields, the list of NEW fields, the list of DISPLAYED fields (it defaults to shown),
            // and the list of current fields. Delete it from the list of proposed fields, since it's now been accepted.
            tempMetaData.fields[fieldName] = {"label": name, "description":desc};
            newFields[fieldName] = {"label": name, "description":desc};
            tempMetaData.formFieldsDisplayed.push(fieldName);
            currentFields.push(fieldName);
            delete this.proposedFields[fieldName];
            propFieldsChanged = true;
          }
        }
      }

      tr=tr.nextElementSibling;
    }

    // Build a string listing the fields from the form (done above) and a string listing the fields from the field object.
    // If they don't match, need to update the order of fields in fields, fieldsDisplayed and formFieldsDisplayed.
    let oldFields = [];
    for (let fieldName in tempMetaData.fields) {
      oldFields.push(fieldName);
    }
    reordered = (JSON.stringify(oldFields) !== JSON.stringify(currentFields));
    if (reordered) {
      let fields = {};
      let fieldsDisplayed = [];
      let formFieldsDisplayed = [];
      for (let i = 0; i < currentFields.length; i++) { // Go through the fields in order as set by currentFields
        const fieldName = currentFields[i];
        if (tempMetaData.fieldsDisplayed.indexOf(fieldName) !== -1) {
          fieldsDisplayed.push(fieldName);
        }
        // If this field is in this.formFieldsDisplayed (so should also be in formFieldsDisplayed) and isn't a duplicate
        if (tempMetaData.formFieldsDisplayed.indexOf(fieldName) !== -1 && formFieldsDisplayed.indexOf(fieldName) === -1) {
          formFieldsDisplayed.push(fieldName);
        }
        fields[fieldName] = tempMetaData.fields[fieldName];
      }
      tempMetaData.fields = fields;
      tempMetaData.fieldsDisplayed = fieldsDisplayed;
      tempMetaData.formFieldsDisplayed = formFieldsDisplayed;
    }

    details.lastSaveFFD = tempMetaData.formFieldsDisplayed; // Reflects formFieldsDisplayed at last save

    // If there is nothing to save, just refresh and resolve the promise.
    // This should only ever execute when saving, because adding uses an object, not an array, for data.
    // That's good because we want to create the new node when adding, even if no data were entered.
    if (data.length === 0) {
      this.refresh();
      resolve(saveObj);
    }
    else {
      let obj = {};
      let CRUD = "";

      if (action === "Save") {
        obj.node = {"name":"n", "id":details.id};
        obj.changes = data;
        CRUD = "changeNode";
      }
      else {
        obj = {"name":"n", "type":details.queryObjectName, "properties":data};
        CRUD = "createNode";
      }

      saveObj.tempMetaData = tempMetaData;
      saveObj.newFields = newFields;
      saveObj.propFieldsChanged = propFieldsChanged;

      app.REST.sendQuery(obj, CRUD, "Saving node", userRequest, details.widgetDOM, null, null, function(data, userRequest, saveObj) {
        // First, if this is a file node, and a new file has been uploaded or the node has been copied,
        // call the server's saveFile function. Also, if a new file has been uploaded,
        // increment this.numStoredFiles and the file counter in the widget.
        if (saveObj.details.queryObjectName === "file" && (saveObj.details.fileBinary ||
          (saveObj.details.owner && saveObj.details.owner.GUID !== saveObj.app.login.userGUID))) {
          const obj = {"userGUID":saveObj.app.login.userGUID, "nodeGUID":data[0].n.properties.M_GUID};
          if (saveObj.details.fileBinary) {
            obj.fileBinary = saveObj.details.fileBinary;
            obj.fileType = saveObj.app.getProp(saveObj.details, "currentData", "properties", "type", saveObj.details.numStoredFiles++);

            const storedCounter = saveObj.app.domFunctions.getChildByIdr(saveObj.details.widgetDOM, 'numStoredFiles');
            storedCounter.textContent = saveOBj.details.numStoredFiles;
          }

          if ((saveObj.details.owner && saveOBj.details.owner.GUID !== saveObj.app.login.userGUID)) {
            obj.copyNodeGUID = saveObj.details.currentData.properties.M_GUID;
            obj.copyUserGUID = saveObj.details.owner.GUID;
          }

          const queryObject = {"server": "file", "function": "saveFile", "query": obj};
          const request = JSON.stringify(queryObject);

          const serverRequest = saveObj.app.REST.serverRequests[saveObj.userRequest]++; // record the current server request and then increment

          const xhttp = new XMLHttpRequest();
          const update = saveObj.app.REST.startProgress(saveObj.details.widgetDOM, "Saving file", request.length, saveObj.userRequest, serverRequest);

          xhttp.onreadystatechange = function() {
            if (this.readyState == 4 && this.status == 200) {
              const responseSize = this.responseText.length;
              saveOBj.app.REST.stopProgress(saveObj.details.widgetDOM, update, responseSize, saveObj.userRequest, serverRequest);
            }
          };

          xhttp.open("POST", "");
          xhttp.send(request);         // send request to server
        } // end if (a file needs to be saved)

        // Then resolve the promise. This will execute before the file is finished saving, but that shouldn't be a problem.
        saveObj.data = data;
        resolve(saveObj);
      }.bind(this), saveObj);
    }
  }); // end Promise constructor
}

updateMetaDataPromise(saveObj) {
  return new Promise(function(resolve, reject) {
    const metadataObj = {};
    metadataObj.from = {"id":saveObj.app.login.userID, "return":false};
    metadataObj.rel = {"type":"Settings", "merge":true, "return":false};
    metadataObj.to = {"type":"M_MetaData", "name":"metadata", "properties":{"name":saveObj.details.queryObjectName}};
    metadataObj.changes = [];

    const propertyNames = ['fieldsDisplayed', 'formFieldsDisplayed', 'nodeLabel', 'orderBy', 'fields'];
    for (let i = 0; i < propertyNames.length; i++) {
      // Go through all properties and add them to the changes list if their new values in tempMetaData differ from the ones saved in the details object
      if (JSON.stringify(saveObj.details[propertyNames[i]]) !== JSON.stringify(saveObj.tempMetaData[propertyNames[i]])) {
        const change = {};
        change.item = "rel";
        change.property = propertyNames[i];
        change.value = saveObj.app.stringEscape(JSON.stringify(saveObj.tempMetaData[propertyNames[i]]));
        metadataObj.changes.push(change);

        // Update properties in the details object to match their new values
        saveObj.details[propertyNames[i]] = saveObj.tempMetaData[propertyNames[i]];
        saveObj.details.queryObject[propertyNames[i]] = saveObj.tempMetaData[propertyNames[i]];
      }
    }

    saveObj.app.REST.sendQuery(metadataObj, "changeRelation", "Updating settings", saveObj.userRequest, saveObj.details.widgetDOM, null, null, function(data, userRequest, saveObj) {
      saveObj.metaData = data;
      resolve(saveObj);
    }, saveObj);
  });
}

updateFieldsPromise(saveObj) {
  return new Promise(function(resolve, reject){ // Right now this is at the end of a promise chain, but may as well still make it a promise in case we want to tack something else on later
    // Need to update fields if there are any new fields.
    // Need to update proposedFields if the list of proposed fields has changed.

    if (Object.keys(saveObj.newFields).length > 0 || saveObj.propFieldsChanged) {
      let updateFields = false;

      let fields = JSON.parse(saveObj.metaData[0].metadata.properties.fields); // Get the most recent list of fields (from the metadata query in updateMetaData)
      for (let fieldName in saveObj.newFields) { // Add any new fields to the fields object
        fields[fieldName] = saveObj.newFields[fieldName];
        updateFields = true;
      }

      let propFields = JSON.parse(saveObj.metaData[0].metadata.properties.proposedFields);
      // Remove old proposed fields
      for (let fieldName in propFields) {
        if (fieldName in fields) {
          delete propFields[fieldName]; // If it's in fields, it's an official field now, not just a proposed field
        }
      }

      // Add new proposed fields
      for (let fieldName in saveObj.details.proposedFields) {
        propFields[fieldName] = saveObj.details.proposedFields[fieldName];
      }

      const obj = {};
      obj.node = {"type":"M_MetaData", "properties":{"name":saveObj.details.queryObjectName}, "return":false};
      obj.changes = [];

      if (updateFields) {
        obj.changes.push({"property":"fields", "value":saveObj.app.stringEscape(JSON.stringify(fields))});
      }
      if (propFieldsChanged) {
        obj.changes.push({"property":"proposedFields", "value":saveObj.app.stringEscape(JSON.stringify(propFields))});
      }

      if (obj.changes.length > 0) {
        saveObj.app.REST.sendQuery(obj, "changeNode", "Updating metadata", saveObj.userRequest, saveObj.details.widgetDOM, null, null, function() {
          resolve(); // Resolve after DB call, if a DB call needs to be made...
        });
      }
      else {
        resolve(); // or after determining that no DB call needs to be made because the changes list is empty...
      }
    } // end if (there are new fields or the list of proposed fields has changed)
    else {
      resolve(); // or after determining that no DB call needs to be made because there are no new fields and no changes to proposed fields
    }
  });
}

checkOwnerPromise(saveObj) {
  return new Promise(function(resolve, reject) {
    // By the time we get here, the node has been saved. It should definitely be owned by the person who just saved it.
    // So if they are already its owner, great; if not, they need to be made its owner
    if (!(saveObj.details.owner && saveObj.details.owner.GUID === saveObj.app.login.userGUID)) {

      // Set owner in the JS object...
      saveObj.details.owner = {"name":saveObj.app.login.userName, "id":saveObj.app.login.userID, "GUID":saveObj.app.login.userGUID};

      // and create an owner link in the DB
      const obj = {};
      obj.from = {"properties": {"M_GUID":saveObj.data[0].n.properties.M_GUID}, "return":false};
      obj.rel = {"type":"Owner", "merge":true, "return":false};
      obj.to = {"properties": {"M_GUID":saveObj.app.login.userGUID}, "return":false};

      saveObj.app.REST.sendQuery(obj, "createRelation", "Setting owner", saveObj.userRequest, saveObj.details.widgetDOM, null, null, function() {
        resolve();
      })
    } // end if (owner needs to be set)
    else {
      resolve(); // resolve right away if the owner doesn't need to be set
    }
  }); // end promise constructor
}

saveComplete(saveObj) { // Refreshes the node table and logs that addSave was clicked
  // Parse properties if needed and store the data
  for (let prop in saveObj.data[0].n.properties) {
    // strings can stay strings and numbers are already stored as numbers.
    // Anything else was stored as a string and needs to be parsed.
    let type = app.getProp(this.fields, prop, "type");
    if (type && type !== "string" && type !== "number") {
      saveObj.data[0].n.properties[prop] = JSON.parse(saveObj.data[0].n.properties[prop]);
    }
  }

  this.savedData = saveObj.data[0].n;

  // Keep the trash relation shown in the table, if any
  const text = app.domFunctions.getChildByIdr(this.widgetDOM, 'trashReason');
  const checkbox = app.domFunctions.getChildByIdr(this.widgetDOM, 'trashCheck');
  if (checkbox.checked) {
    this.savedData.properties._trash = true;
    this.savedData.properties.reason = text.value;
  }
  else {
    this.savedData.properties._trash = false;
  }

  // Make a copy - currentData constantly updates while savedData updates only on save
  this.currentData = JSON.parse(JSON.stringify(this.savedData));

  // The node belongs to the user who has just saved it
  this.owner = {"name":app.login.userName, "id":app.login.userID, "GUID":app.login.userGUID};

  // If the user has just added this node, its ID needs to be set
  if (saveObj.action === "Add") {
    this.id = this.savedData.id;
    const name = this.savedData.properties.name;
    const nameLabel = app.domFunctions.getChildByIdr(this.widgetDOM, "name");
    nameLabel.textContent=`: ${name}`;
  }

  // If this is a standalone node (so should show relations)
  // and has just been added (so its relations weren't already shown), call buildStart to show them
  if (this.buildStart && saveObj.action === "Add") {
    this.buildStart(saveObj.userRequest);
  }

  // Update the widget
  this.refresh();

  // log
  const obj = {};
  obj.id = this.idWidget;
  obj.idr = "addSaveButton";
  obj.action = "click";
  obj.data = JSON.parse(JSON.stringify(saveObj.data));
  app.stripIDs(obj.data);
  app.regression.log(JSON.stringify(obj));
  app.regression.record(obj);
}

changed(cell, edited) { // Highlights when current fields are different from saved fields
  // Make sure we have a currentData object - if this is a new node it may need to be created
  if (!app.getProp(this, "currentData")) {
    this.currentData = {"properties":{}};
  }

  // get fieldName
  const row = cell.parentElement;
  const idr = row.getAttribute("idr");
  let fieldName = "";
  if (idr.slice(0,2) === "tr") {
    fieldName = idr.slice(2);
  }

  // Assuming this cell does represent a field ...
  if (fieldName in this.fields) {
    // Get the value
    let value = "";
    const input = cell.firstElementChild;
    if (input && (input.tagName == "INPUT" || input.tagName == "TEXTAREA")) { // If this cell has an input (is editable)
      value = input.value;
    }
    else {
      value = cell.textContent;
    }

    // Update current data if the user has edited the field
    if (edited) {
      this.currentData.properties[fieldName] = value;
    }

    // Only bother checking data if there is saved data to compare it to
    if (this.savedData) {
      // give visual feedback if edit data is different than db data
      if (value === this.savedData.properties[fieldName]) {
        cell.classList.remove('changedData');
      }
      else {
        cell.classList.add('changedData');
      }
    } // end if (savedData exists; we can compare it to current data)
  } // end if (fieldName exists and is a valid field; we can set currentData)
} // end method (changed)

toggleReason(checkBox) {
  const reason = app.domFunctions.getChildByIdr(this.trashRow, 'trashReason');
  const reasonText = app.domFunctions.getChildByIdr(this.trashRow, 'reasonText');

  if (checkBox.checked) {
    reason.removeAttribute("hidden");
    reasonText.removeAttribute("hidden");
    this.currentData.properties._trash = true;
    if (this.savedData.properties._trash) {
      checkBox.classList.remove('changedData');
    }
    else {
      checkBox.classList.add('changedData');
    }
  }
  else {
    reason.setAttribute("hidden", true);
    reasonText.setAttribute("hidden", true);
    this.currentData.properties._trash = false;
    if (this.savedData.properties._trash) {
      checkBox.classList.add('changedData');
    }
    else {
      checkBox.classList.remove('changedData');
    }
  }
}

drag(button, evnt) {
  let name = "";
  const nameNum = this.formFieldsDisplayed.indexOf('name');
  if (nameNum > -1) {
    const nameRow = this.tBodyDOM.children[nameNum];
    const nameCell = nameRow.children[1];
    const input = nameCell.children[0];
    name = input.value;
  }

  const data = {};
  data.name = name;
  data.type = this.nodeLabel;
  data.DBType = this.queryObjectName;
  data.nodeID = this.currentData.properties.M_GUID;

  data.details = [];
  for (let i = 0; i< this.formFieldsDisplayed.length; i++) { // For every displayed field...
    const input = this.tBodyDOM.children[i].children[1].children[0];
    const fieldName = this.formFieldsDisplayed[i];
    if (fieldName != "name") { // skip the name...
      const detailObj = {};
      detailObj.field = fieldName;
      detailObj.value = input.value;
      data.details.push(detailObj);
    }
  }

  data.sourceID = app.domFunctions.widgetGetId(button);
  data.sourceType = "widgetNode";
  data.sourceTag = button.tagName;
  evnt.dataTransfer.setData("text/plain", JSON.stringify(data));
}
} ///////////////////// endclass
