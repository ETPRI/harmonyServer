class REST {
  constructor() {
    this.userRequest = 0;
    this.requestDetails = [];
    this.serverRequests = [];
  }

  startUserRequest(text) {
    const avail = document.getElementById("available2");
    if (avail) {
      avail.hidden = true;
    }
    const ongoing = document.getElementById("ongoing2");
    if (ongoing) {
      ongoing.hidden = false;

      const row = document.createElement("LI");
      const status = document.createTextNode(`${this.userRequest}) ${text}`);
      const timer = document.createElement("SPAN");
      timer.innerHTML = ":  0 ms";
      timer.setAttribute('idr', 'timer');
      row.setAttribute('id', `requestRow${this.userRequest}`);
      row.appendChild(status);
      row.appendChild(timer);
      ongoing.appendChild(row);

      this.requestDetails[this.userRequest] = [];
      this.serverRequests[this.userRequest] = 0;

      return this.userRequest++; // Return and then increment
    }
  }

  // DOMelement is usually the whole widget, but it will also work if it's an element from within the widget.
  // Use it to work up to the top-level widget, then give it a class of "requestRunning".
  startProgress(DOMelement, text, request, userRequest, serverRequest) {
  	let topWidget = null;
  	let recordStartTime = null;

  	while (DOMelement) {
  		if (DOMelement.classList.contains("widget")) {
  			topWidget = DOMelement;
  		}
  		DOMelement = DOMelement.parentElement;
  	}

  	// topWidget should now be the top-level widget containing the element, or null if the element doesn't exist or isn't in a widget
  	if (topWidget) {
  		const freezables = topWidget.getElementsByClassName('freezable');
  		for (let i = 0; i < freezables.length; i++) {
  			freezables[i].classList.add("requestRunning");
  		}
  		const header = topWidget.getElementsByClassName('widgetHeader');
  		for (let i = 0; i < header.length; i++) {
  			header[i].classList.add("grayedOut");
  		}

  		const cancel = app.domFunctions.getChildByIdr(topWidget, 'cancelButton');
  		cancel.classList.remove('hidden');
  	}

  	let update = null;

  	const ongoing = document.getElementById("ongoing2");
  	if (ongoing) {
  		// ongoing.hidden = false;

  		const row = document.getElementById(`requestRow${userRequest}`);
  		if (topWidget && topWidget.id) {
  			row.setAttribute("widget", topWidget.id);
  		}
  		// const status = document.createTextNode(text);
  		const timer = app.domFunctions.getChildByIdr(row, 'timer');
      // Subtract the time already elapsed from now to get the effective start time
      const startTime = performance.now() - parseInt(timer.textContent.slice(3));

  		update = setInterval(function () {
  			const currTime = performance.now();
  			const elapsedTime = currTime - startTime;
  			timer.innerHTML = `:  ${Math.round(elapsedTime)} ms`;
  		}, 10);

  		row.setAttribute("update", update);
  	}

  	const requestObj = {"timer":update};
    recordStartTime = Date.now();
    requestObj.startTime = recordStartTime;

  	if (topWidget) {
  		const id = topWidget.getAttribute('id');
  		const JSinstance = app.widgets[id];
  		if (JSinstance) {
  			if (JSinstance.requests == undefined) { // make sure there's a requests array
  				JSinstance.requests = [];
  			}
  			JSinstance.requests.push(requestObj);
  		}
  	}

    this.requestDetails[userRequest][serverRequest] = {
      "userRequest":userRequest,
      "serverRequest":serverRequest,
      "description":text,
      "startTime":recordStartTime,
      "requestLength":request.length,
      "request":JSON.parse(request)
    };

  	if (app.login.sessionGUID && app.login.browserGUID) { // if a session is ongoing, record the request
      requestObj.userRequest = userRequest;
      requestObj.serverRequest = serverRequest;

  	  const obj = {};
  	  obj.from = {"type":"M_Session", "properties":{"M_GUID":app.login.sessionGUID}};
  	  obj.rel = {"type":"Request",
                 "properties": JSON.parse(JSON.stringify(this.requestDetails[userRequest][serverRequest]))};
  	  obj.to = {"type":"M_Browser", "properties":{"M_GUID":app.login.browserGUID}};

  	  const xhttp = new XMLHttpRequest();

  	  xhttp.open("POST","");
  	  const queryObject = {"server": "CRUD", "function": "createRelation", "query": obj, "GUID": "upkeep"};
  	  xhttp.send(JSON.stringify(queryObject));         // send request to server
  	} // end if (a session is ongoing)
  	return requestObj; // Info stopProgress will need later
  }

  stopProgress(DOMelement, obj, response, userRequest, serverRequest) {
  	let requests = [];
  	let topWidget = null;
  	let result = "Succeeded";

  	let DOMelSearch = DOMelement;

  	while (DOMelSearch) { // Get the top widget that the DOM element is in
  		if (DOMelSearch.classList.contains("widget")) {
  			topWidget = DOMelSearch;
  		}
  		DOMelSearch = DOMelSearch.parentElement;
  	}

    // The JS object (instance of widgetNode, widgetTableNodes, etc.) which is associated with the top widget
  	let JSinstance = null;

  	if (topWidget) {
  		const id = topWidget.getAttribute('id');
  		JSinstance = app.widgets[id];
  	}

  	// If this was called by a cancel button (and the button was passed in), get the request list from the widget the cancel button was in
  	if (DOMelement && DOMelement.tagName == 'INPUT' && DOMelement.type == "button" && DOMelement.value == "Cancel" && JSinstance) {
  		requests = Array.from(JSinstance.requests); // This will include timer, count and startTime. Make a copy so as not to change requests while changing JSinstance.requests
  		result = "Cancelled";
  	}

  	// If this was called by a request finishing (and a widget element and update object were passed in), use the update object as the request
  	else if (obj) {
  		requests.push(obj);
  	}

  	for (let i = 0; i < requests.length; i++) {
  		if (requests[i].timer) {
  			clearInterval(requests[i].timer);
  		}
  		if (JSinstance) {
  			JSinstance.requests.splice(JSinstance.requests.indexOf(requests[i]), 1); // remove from JS class, if it exists
  		}

      const duration = Date.now() - requests[i].startTime;
      this.requestDetails[userRequest][serverRequest].duration = duration;
      this.requestDetails[userRequest][serverRequest].result = result;

      if (response) {
        this.requestDetails[userRequest][serverRequest].responseLength = response.length;
        this.requestDetails[userRequest][serverRequest].response = JSON.parse(response); // store this (unstringified) in object but not (for now) in DB
      }

  		// If a session is running, and the count is defined (meaning that this request was logged when it began),
  		// then update the record of that request now.
  		if (app.login.sessionGUID && app.login.browserGUID
        && requests[i].userRequest !== undefined && requests[i].serverRequest !== undefined) {

  			const obj = {};
  			obj.from = {"type":"M_Session", "properties":{"M_GUID":app.login.sessionGUID}};
  			obj.rel = {"type":"Request", "properties":{"userRequest":requests[i].userRequest, "serverRequest":requests[i].serverRequest}};
  			obj.to = {"type":"M_Browser", "properties":{"M_GUID":app.login.browserGUID}};
  			obj.changes = [
  					{"item":"rel", "property":"duration", "value":duration},
  					{"item":"rel", "property":"endResult", "value":result},
  			];

  			if (response) { // if the response exists - meaning if this was called after a response was received, not by a cancel button
  				obj.changes.push({"item":"rel", "property":"responseLength", "value":response.length});
  			}

  			const xhttp = new XMLHttpRequest();

  			xhttp.open("POST","");
  			const queryObject = {"server": "CRUD", "function": "changeRelation", "query": obj, "GUID": "upkeep"};
  			xhttp.send(JSON.stringify(queryObject));         // send request to server
  		}
  	}

  	// topWidget should now be either
  	// a) the top-level widget containing the element which was passed in (usually the case), or
  	// b) null (if the element passed in didn't exist or wasn't in a widget)

  	// If the top widget exists, the JS class for that widget exists and all requests have been cleared,
  	// unfreeze its freezable parts and hide the cancel button
  	if (topWidget && JSinstance && JSinstance.requests.length === 0) {
  		const freezables = topWidget.getElementsByClassName('freezable');
  		for (let i = 0; i < freezables.length; i++) {
  			freezables[i].classList.remove("requestRunning");
  		}
  		const header = topWidget.getElementsByClassName('widgetHeader');
  		for (let i = 0; i < header.length; i++) {
  			header[i].classList.remove("grayedOut");
  		}

  		const cancel = app.domFunctions.getChildByIdr(topWidget, 'cancelButton');
  		cancel.classList.add('hidden');
  	}
  }

  clearRequests() {
  	// For each row, get the update and clear the interval (just in case it's still going)
  	const ongoing = document.getElementById("ongoing2");
  	const rows = ongoing.children;
  	for (let i = 0; i < rows.length; i++) {
  		const row = rows[i];
  		const update = row.getAttribute('update');
  		clearInterval(update);
  	}

  	// Then remove all rows from the ongoing list, hide it and show the available text
  	ongoing.innerHTML = "";
  	ongoing.hidden = true;

  	const avail = document.getElementById("available2");
  	avail.hidden = false;

  	const box = ongoing.parentElement;

  	// Repaint the box - there's a bug (NOT in my code - a known issue) that makes it disappear when the scrollbars disappear
  	box.parentElement.insertBefore(box, box.nextElementSibling);

  }

  sendQuery(obj, CRUD, description, userRequest, DOMelement, GUID, url, onComplete, ...args) {
  	if (!GUID) {
  		GUID = app.getProp(app, "login", "userGUID");
  	}
  	if (!GUID) {
  		GUID = "upkeep";
  	}

  	if (!url) {
  		url = "";
  	}

    const serverRequest = this.serverRequests[userRequest]++; // store current value and increment

  	const queryObject = {"server": "CRUD", "function": CRUD, "query": obj, "GUID": GUID};
  	const request = JSON.stringify(queryObject);

  	const xhttp = new XMLHttpRequest();
  	const update = this.startProgress(DOMelement, description, request, userRequest, serverRequest);
  	const REST = this;

  	xhttp.onreadystatechange = function() {
  		if (this.readyState == 4 && this.status == 200) {
  			const data = JSON.parse(this.responseText);
  			REST.stopProgress(DOMelement, update, this.responseText, userRequest, serverRequest);
  			if (onComplete) {
  				onComplete(data, userRequest, ...args);
  			}
  		}
  	};

  	xhttp.open("POST", url);
  	xhttp.send(request);         // send request to server
  }
}
