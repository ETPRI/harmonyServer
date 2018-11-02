class sync {
  constructor() {
    this.localCount = 0;
    this.remoteCount = 0;
    this.currentToPush = [];
    this.currentToPull = [];
    this.batchSize = 100;
    this.startTime = null;

    this.widgetDOM = null;
    this.partnerIP = null;
    this.progress = null;

    this.localMinCount = -1;
    this.remoteMinCount = -1;

    this.idWidget = app.idCounter;
    app.widgets[app.idCounter] = this; // Add to app.widgets

    this.buildWidget();
    this.getPartner();
  }

  // Create the header, hide the close button, and create a table to show progress.
  // The table is in a div so it will be easy for me to come back and add a timer later.
  buildWidget() {
    const html = app.widgetHeader('widgetSync') + `<b>Syncing - Progress</b></span>
    <input type="button" class="hidden" idr="cancelButton" value="Cancel" onclick="app.stopProgress(this)"></div>
    <div class="widgetBody freezable">
      <table>
        <thead><tr>
          <th>Type</th><th>Name</th><th>Done</th><th>Total</th>
        </thead></tr>
        <tbody id="progress">
          <tr><th>Item</th><th>To do</th><th>Downloaded</th>Processed</tr>
        </tbody>
      </table>
    </div></div>`;

    const parent = document.getElementById('widgets');
    const newWidget = document.createElement('div'); // create placeholder div
    parent.insertBefore(newWidget, parent.firstElementChild);
    newWidget.outerHTML = html;

    this.widgetDOM = document.getElementById(this.idWidget);
    this.progress = app.domFunctions.getChildByIdr(this.widgetDOM, 'progress');

    const close = app.domFunctions.getChildByIdr(this.widgetDOM, 'closeButton');
    close.classList.add('hidden');
  }

  // Searches for an M_DataSharePartner node. If one is found, stores its IP address and the changelog number to start at
  // in both the local and remote databases. If none is found, prompts the user to enter an IP address manually or cancel.
  // If more than one is found, prompts the user to enter an IP address manually or cancel, and sets the changelog numbers
  // to start at if the IP address entered matches one of the nodes that was found. Calls countRemote if not cancelled.
  getPartner() {
    const obj = {"node":{"type":"M_DataSharePartner"}};
    app.sendQuery(obj, "changeNode", "Finding database info", this.widgetDOM, null, null, function(data) {
      if (data.length == 0) {
        const IP = prompt(`This database has no record of a shared database to sync with. If you want to continue,
          you may enter the IP address (including port number) of the database you want to sync with manually.
          Be aware that if your database was not originally based on the database you sync with, the results of syncing
          will be unpredictable (for instance, the wrong node or no node at all could have its value updated).
          Please enter the IP address (including port number) and click OK to continue, or click Cancel to cancel:`);
        if (IP) {
          this.partnerIP = IP;
          this.countRemote();
        }
      }
      else if (data.length == 1) {
        this.partnerIP = data[0].node.properties.IPaddress;
        this.localMinCount = data[0].node.properties.localMinCount;
        this.remoteMinCount = data[0].properties.remoteMinCount;
        this.countRemote();
      }
      else {
        const addressesText = "";
        const partnerInfo = {};
        for (let i = 0; i < data.length; i++) {
          addresses += `${data[i].properties.IPaddress}, `;
          partnerInfo[data[i].properties.IPaddress] = {"local":data[i].properties.localMinCount, "remote":data[i].properties.remoteMinCount};
        }
        addresses = addresses.slice(0, -2);
        const IP = prompt(`This database has multiple records of shared databases to sync with. Their IP addresses are: ${addresses}
          If you want to continue, you may enter the IP address (including port number) of the database you want to sync with manually.
          Be aware that if your database was not originally based on the database you sync with, the results of syncing
          will be unpredictable (for instance, the wrong node or no node at all could have its value updated).
          Please enter the IP address (including port number) and click OK to continue, or click Cancel to cancel:`);
        if (IP) {
          this.partnerIP = IP;
          if (partnerInfo[IP]) {
            this.localMinCount = partnerInfo[IP].local;
            this.remoteMinCount = partnerInfo[IP].remote;
          }
          this.countRemote();
        }
      }
    }.bind(this)); // end sendQuery
  }

  // Queryies the remote database for the number of changelogs to process
  countRemote(data) {
    const obj = {"GUID":app.login.userGUID, "external":true, "count":true, "min": this.remoteMinCount};
    app.sendQuery(obj, "getChangeLogs", "Counting remote changelogs", this.widgetDOM, null, this.partnerIP, function(data) {
      this.remoteCount = data[0].count;
      this.progress.innerHTML += `<tr><th>Changes to pull:</th><td>${data[0].count}</td><td idr="pullDownloaded">0</td><td idr="pullProcessed">0</td></tr>`;
      this.countLocal();
    }.bind(this));
  }

  // Queries the local database for the number of changelogs to process
  countLocal() {
    const obj = {"GUID":app.login.userGUID, "count":true, "min": this.localMinCount};
    app.sendQuery(obj, "getChangeLogs", "Counting local changelogs", this.widgetDOM, null, null, function(data) {
      this.localCount = data[0].count;
      this.progress.innerHTML += `<tr><th>Changes to push:</th><td>${data[0].count}</td><td idr="pushDownloaded">0</td><td idr="pushProcessed">0</td></tr>`;
      this.downloadChangeLogs("pull"); // start downloading remote changelogs
    }.bind(this));
  }

  // Queries a database for changelogs, one batch at a time. Phase is either "push" or "pull". Sends the batch to
  // processChangeLogs, which processes them one at a time and calls downloadChangeLogs again when finished.
  // When downloadChangeLogs gets no data, it's done with this phase and starts the next (pull to push, or push to finish).
  downloadChangeLogs(phase) {
    let external = false;
    let IP = "";
    let min = this.localMinCount;

    if (phase == pull) {
      external = true;
      IP = this.partnerIP;
      min = this.remoteMinCount;
    }

    const obj = {"GUID":app.login.userGUID, "external":external, "min": min};
    app.sendQuery(obj, "getChangeLogs", "Downloading changelogs", this.widgetDOM, null, IP, function(data) {
      if (data.length > 0) {
        // Update the progress table and minimum, then call processChangeLogs
        const downloaded = app.domFunctions.getChildByIdr(this.progress, `${phase}Downloaded`);
        let numDownloaded = parseInt(downloaded.textContent);
        numDownloaded += data.length;
        downloaded.textContent = numDownloaded;

        const lastNum = app.getProp(data, data.length - 1, "n", "properties", "number");
        if (lastNum) {
          if (phase == pull) {
            this.remoteMinCount = lastNum;
          }
          else {
            this.localMinCount = lastNum;
          }
        }
        else {
          app.error(`Changelog ${app.getProp(data, data.length - 1, "n", "id")} is missing its number`);
        }

        this.processChangeLogs(data, phase);
      } // end if (data were retrieved)
      else {
        if (phase == pull) {
          this.downloadChangeLogs("push"); // done pulling; start pushing
        }
        else {
          this.getMin(""); // done pushing; finish sync
        }
      } // end else (no data; done with this phase)
    }.bind(this));
  }

  processChangeLogs(changeLogs, phase) {
    if (changeLogs.length > 0) {
      const log = changeLogs.shift();
      let obj = null;
      let CRUD = "";

      if (log.properties.itemType == "node") {
        switch (log.properties.action) {
          case 'create':
            obj = {"type":log.properties.label, "return":false};
            CRUD = "createNode";
            break;
          case 'change':
            obj = {};
            obj.node = {"properties":{"M_GUID":log.properties.item_GUID}, "return":false};
            obj.changes = [{"property":log.properties.attribute, "value":log.properties.value}]
            CRUD = "changeNode";
            break;
          case 'delete':
            obj = {"properties":{"M_GUID":log.properties.item_GUID}, "return":false};
            CRUD = "deleteNode";
            break;
          default:
            app.error(`ChangeLog 'action' property should be create, change or delete, but is ${log.properties.action}`);
            break;
        }
      }
      else if (log.properties.itemType == "relation") {
        switch (log.properties.action) {
          case 'create':
            obj = {};
            obj.to = {"properties":{"M_GUID":log.properties.to_GUID}, "return":false};
            obj.rel = {"type":log.properties.label, "return":false};
            obj.from = {"properties":{"M_GUID":log.properties.from_GUID}, "return":false};
            CRUD = "createRelation";
            break;
          case 'change':
            obj = {};
            obj.to = {"return":false};
            obj.from = {"return":false};
            obj.rel = {"properties":{"M_GUID":log.properties.item_GUID}, "return":false};
            obj.changes = [{"item":"rel", "property":log.properties.attribute, "value":log.properties.value}]
            CRUD = "changeRelation";
            break;
          case 'delete':
            obj.to = {"return":false};
            obj.from = {"return":false};
            obj.rel = {"properties":{"M_GUID":log.properties.item_GUID}, "return":false};
            CRUD = "deleteRelation";
            break;
          default:
            app.error(`ChangeLog 'action' property should be create, change or delete, but is ${log.properties.action}`);
            break;
        }
      }
      else {
        app.error(`ChangeLog 'itemType' property should be node or relation, but is ${log.properties.itemType}`)
      }

      // obj and CRUD should be set by now

      if (obj) {
        let IP = "";

        if (phase == push) {
          IP = this.partnerIP;
        }

        app.sendQuery(obj, CRUD, "Processing changeLog", this.widgetDOM, app.getProp(log, "properties", "user_GUID"), IP, function(data, changeLogs, phase) {
          // Update progress and move on to next changeLog
          let processed = app.domFunctions.getChildByIdr(this.progress, `${phase}Processed`);
          let numProcessed = parseInt(processed.textContent);
          numProcessed++;
          processed.textContent = numProcessed;

          this.processChangeLogs(changeLogs, phase);
        }.bind(this), changeLogs, phase);
      }
    } // end if (there are more changeLogs)
    else {
      this.downloadChangeLogs(phase);
    }
  } // end method (processChangeLogs)

  // Get the highest changelog number from a DB, which will be the lower limit for searching for changelogs the next time the DBs sync
  // If the highest changelog number exists, passes it to setMin to update the M_DataSharePartner node. If not, moves on -
  // after getting the local min, gets the remote one, and after the remote one, calls finish() to wrap up the sync.
  getMin(IP) {
    const obj = {};
    obj.node = {"type":"M_ChangeLog"};
    obj.limit = 1;
    obj.order = [{"name":"number", "direction":"D"}];
    app.sendQuery(obj, "changeNode", "Updating sync records", this.widgetDOM, app.login.userGUID, IP, function(data) {
      if (app.getProp(data, 0, "node", "number")) {
        this.setMin(data[0].node.number, IP);
      }
      else if (IP == "") {
        this.getMin(this.partnerIP);
      }
      else {
        this.finish();
      }
    }.bind(this), IP);
  }

  // Updates or creates the M_DataSharePartner node corresponding to this.partnerIP. Sets the minimum local or remote
  // (depending on the IP address passed in) changeLog number to check on the next sync. Then calls getMin or finish.
  setMin(number, IP) {
    let property = "";
    if (IP === "") {
      property = "localMinCount";
    }
    else if (IP === this.partnerIP) {
      property = "remoteMinCount";
    }

    const obj = {};
    obj.node = {"type":"M_DataSharePartner", "properties":{"IPaddress":this.partnerIP}, "return":false, "merge":true};
    obj.changes = [{"property":property, "value":number}];

    app.sendQuery(obj, "changeNode", "Updating sync records", this.widgetDOM, null, null, function(data, IP) {
      if (IP == "") {
        this.getMin(this.partnerIP);
      }
      else if (IP === this.partnerIP) {
        this.finish();
      }
    }.bind(this));
  }

  // At this point, all database functions are done - all that's left is to tell the user that the sync has finished and unhide the close button
  finish() {
    alert("Finished syncing! You may close the sync widget now.");

    const close = app.domFunctions.getChildByIdr(this.widgetDOM, 'closeButton');
    close.classList.remove('hidden');
  }
}
