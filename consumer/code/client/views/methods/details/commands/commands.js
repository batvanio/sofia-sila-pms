var pageSession = new ReactiveDict();

Template.MethodsDetailsCommands.rendered = function() {
	
};

Template.MethodsDetailsCommands.events({
	
});

Template.MethodsDetailsCommands.helpers({
	
});

var MethodsDetailsCommandsViewItems = function(cursor) {
	if(!cursor) {
		return [];
	}

	var searchString = pageSession.get("MethodsDetailsCommandsViewSearchString");
	var sortBy = pageSession.get("MethodsDetailsCommandsViewSortBy");
	var sortAscending = pageSession.get("MethodsDetailsCommandsViewSortAscending");
	if(typeof(sortAscending) == "undefined") sortAscending = true;

	var raw = cursor.fetch();

	// filter
	var filtered = [];
	if(!searchString || searchString == "") {
		filtered = raw;
	} else {
		searchString = searchString.replace(".", "\\.");
		var regEx = new RegExp(searchString, "i");
		var searchFields = ["commandId", "requestId", "commandName", "command_parameters", "status"];
		filtered = _.filter(raw, function(item) {
			var match = false;
			_.each(searchFields, function(field) {
				var value = (getPropertyValue(field, item) || "") + "";

				match = match || (value && value.match(regEx));
				if(match) {
					return false;
				}
			})
			return match;
		});
	}

	// sort
	if(sortBy) {
		filtered = _.sortBy(filtered, sortBy);

		// descending?
		if(!sortAscending) {
			filtered = filtered.reverse();
		}
	}

	return filtered;
};

var MethodsDetailsCommandsViewExport = function(cursor, fileType) {
	var data = MethodsDetailsCommandsViewItems(cursor);
	var exportFields = ["commandId", "requestId", "commandName", "command_parameters", "status"];

	var str = convertArrayOfObjects(data, exportFields, fileType);

	var filename = "export." + fileType;

	downloadLocalResource(str, filename, "application/octet-stream");
};

var runCommand = function(commandId, url, commandName, args){

	//MethodCommands.update({ _id: commandId }, { "$set": {"status":"Running..."}});
console.log("---3.runCommand.commandId--" + commandId);

	Meteor.call('connectDeviceSoap', url, commandName, args, function (error,response) {
  		// identify the error
  		if (!error) {
			//TODO: check if device is locked and can't get the information.
			var newStatus, newStatusMessage;
			//console.log("wildcard "+response.[*].returnCode);
				if(commandName == "GetStatus") {
				    	console.log("---4.GetStatus--" + commandId);
				    	console.log(response);
						newStatus = response.GetStatusResult.returnCode; 
						newStatusMessage = response.GetStatusResult.message;
				}
				else if(commandName ==  "GetDeviceIdentification"){
						console.log("---4.GetDeviceIdentification--" + commandId);
				    	console.log(response);
						newStatus = response.GetDeviceIdentificationResult.returnCode; 
						newStatusMessage = response.GetDeviceIdentificationResult.message;
						console.log("--GetDeviceIdentification--");
				}
				else if(commandName ==  "Reset"){
					console.log("---4.Reset--" + commandId);
					console.log(response);
					newStatus = response.ResetResult.returnCode ;
					newStatusMessage = response.ResetResult.message;					
				}
				else if(commandName ==  "Shake"){
					console.log("---4.Shake--" + commandId);
					console.log(response);
					newStatus = response.ShakeResult.returnCode ;
					newStatusMessage = response.ShakeResult.message;					
				}
			    //default: //TODO: all the async commands go here (get dynamic response): response.[commandName + "Result"].returnCode
							
			MethodCommands.update({ _id: commandId }, { "$set": {"status": newStatus, "statusMessage": newStatusMessage}});
		}
		else
		{
	    		// show a nice error message
	    		console.log("error soap");
			MethodCommands.update({ _id: commandId }, { "$set": {"status":"404", "statusMessage": "connection error"}});
		}
	});

}


var MethodsDetailsCommandsRun = function(cursor, methodId) {

	var commands = MethodsDetailsCommandsViewItems(cursor);
	//console.log(commands[0]);

	//TODO:
	//1. queue all the commands -> set Status to 'queued' to all commands. Issue: Find better solution for async commands, this will stop the client until all the commands finish 
	//2. call each command sequentially: connectDeviceSoap

	//TODO: add lock functionality

	var meth = Methods.findOne({_id : methodId});
	var dev = Devices.findOne({_id : meth.deviceId});

	_.each(commands, function(c){
		//Add to queue here. TODO: Upgrade and use a job-queue manager: https://github.com/vsivsi/meteor-job-collection/
		MethodCommands.update({ _id: c._id }, { "$set": {"status":"Queued"}});
	});


	var firstCommandFlag = true;
	var previousCommandId; 
	var previousCommandName; //BUG. TODO: delete. This is a Workaround for the bug in HSR bug by not allowing to call multiple commands in parallell (try calling getStatus at the same time sequentially). This line gives some interval of time so the simulator can process. Delete this workaround for a better simulator or a device that allows parallel command calls/execution.

	_.each(commands, function(c){	

		if(c.command_parameters){//for commands with parameters
			var argsString = '{"requestId" : "' + c.requestId + '", ' + c.command_parameters + '}'; // TODO: add dynamic parameters for all the commands
		
		}else{//for commands without parameters
			var argsString = '{"requestId" : "' + c.requestId + '"}'; // TODO: add dynamic parameters for all the commands				
		}
		
		var args = JSON.parse(argsString);


		if(firstCommandFlag)
		{
			//run immediately
			firstCommandFlag = false;	
			runCommand(c._id, dev.url, c.commandName, args);

			if(c.commandName == "GetStatus"){ // or getDeviceIdentification
							previousCommandName = "syncCommand";
						}
						else{
							previousCommandName = "";
						}

		}
		else{
			//Add observeChanges to previous command
			//Defer the execution of the next command until the previous command has completely finished: code 1 (sync commands), or 3 (async commands)

console.log("---1.each.previousCommandId: ");
console.log(previousCommandId);
			var query = MethodCommands.find({_id:previousCommandId});
console.log("---2.each.query: " + query);
console.log(query);

			var handle = query.observeChanges({
			  changed: function (id, method_command) {
			    if(method_command.status){
				    console.log("---observeChanges.changed.status: " + method_command.status + " changed in id " + id);
					if (method_command.status == 1 || method_command.status == 3 ){ //&& status is 1 (sync finished) || 3 (async finished)
						handle.stop();

						if(previousCommandName == "syncCommand" ){
							setTimeout(function () {runCommand(c._id, dev.url, c.commandName, args);}, 1300)// BUG. TODO:delete
						}
						else{
							runCommand(c._id, dev.url, c.commandName, args);
						}

						if(c.commandName == "GetStatus" || c.commandName == "GetDeviceIdentification"){ // or other sync command. BUG. TODO:delete
							previousCommandName = "syncCommand";
						}
						else{
							previousCommandName = "";
						}

						

					}
			    }

			  }
			});
			
			// After five seconds, stop keeping the count.
			//setTimeout(function () {handle.stop();}, 15000);
		}

		previousCommandId = c._id;
	

	});

	Methods.update({ _id: methodId }, { "$set": {"date": new Date()}});
	Methods.update({ _id: methodId }, { "$set": {"status": "Execution complete"}});

};



Template.MethodsDetailsCommandsView.rendered = function() {
	pageSession.set("MethodsDetailsCommandsViewStyle", "table");
	
};

Template.MethodsDetailsCommandsView.events({
	"submit #dataview-controls": function(e, t) {
		return false;
	},

	"click #dataview-search-button": function(e, t) {
		e.preventDefault();
		var form = $(e.currentTarget).parent();
		if(form) {
			var searchInput = form.find("#dataview-search-input");
			if(searchInput) {
				searchInput.focus();
				var searchString = searchInput.val();
				pageSession.set("MethodsDetailsCommandsViewSearchString", searchString);
			}

		}
		return false;
	},

	"keydown #dataview-search-input": function(e, t) {
		if(e.which === 13)
		{
			e.preventDefault();
			var form = $(e.currentTarget).parent();
			if(form) {
				var searchInput = form.find("#dataview-search-input");
				if(searchInput) {
					var searchString = searchInput.val();
					pageSession.set("MethodsDetailsCommandsViewSearchString", searchString);
				}

			}
			return false;
		}

		if(e.which === 27)
		{
			e.preventDefault();
			var form = $(e.currentTarget).parent();
			if(form) {
				var searchInput = form.find("#dataview-search-input");
				if(searchInput) {
					searchInput.val("");
					pageSession.set("MethodsDetailsCommandsViewSearchString", "");
				}

			}
			return false;
		}

		return true;
	},

	"click #dataview-insert-button": function(e, t) {
		e.preventDefault();
		Router.go("methods.details.insert", {methodId: this.params.methodId});
	},

	"click #dataview-export-default": function(e, t) {
		e.preventDefault();
		MethodsDetailsCommandsViewExport(this.method_commands, "csv");
	},

	"click #dataview-export-csv": function(e, t) {
		e.preventDefault();
		MethodsDetailsCommandsViewExport(this.method_commands, "csv");
	},

	"click #dataview-export-tsv": function(e, t) {
		e.preventDefault();
		MethodsDetailsCommandsViewExport(this.method_commands, "tsv");
	},

	"click #dataview-export-json": function(e, t) {
		e.preventDefault();
		MethodsDetailsCommandsViewExport(this.method_commands, "json");
	},

	"click #dataview-run-button": function(e, t) {
		e.preventDefault();
		Methods.update({ _id: this.params.methodId }, { "$set": {"status":"Running"}});
		MethodsDetailsCommandsRun(this.method_commands, this.params.methodId);
		//Router.go("methods.details.insert", {methodId: this.params.methodId});
	}

	
});

Template.MethodsDetailsCommandsView.helpers({
	"isEmpty": function() {
		return !this.method_commands || this.method_commands.count() == 0;
	},
	"isNotEmpty": function() {
		return this.method_commands && this.method_commands.count() > 0;
	},
	"isNotFound": function() {
		return this.method_commands && pageSession.get("MethodsDetailsCommandsViewSearchString") && MethodsDetailsCommandsViewItems(this.method_commands).length == 0;
	},
	"searchString": function() {
		return pageSession.get("MethodsDetailsCommandsViewSearchString");
	},
	"viewAsTable": function() {
		return pageSession.get("MethodsDetailsCommandsViewStyle") == "table";
	},
	"viewAsList": function() {
		return pageSession.get("MethodsDetailsCommandsViewStyle") == "list";
	},
	"viewAsGallery": function() {
		return pageSession.get("MethodsDetailsCommandsViewStyle") == "gallery";
	}

	
});


Template.MethodsDetailsCommandsViewTable.rendered = function() {
	
};

Template.MethodsDetailsCommandsViewTable.events({
	"click .th-sortable": function(e, t) {
		e.preventDefault();
		var oldSortBy = pageSession.get("MethodsDetailsCommandsViewSortBy");
		var newSortBy = $(e.target).attr("data-sort");

		pageSession.set("MethodsDetailsCommandsViewSortBy", newSortBy);
		if(oldSortBy == newSortBy) {
			var sortAscending = pageSession.get("MethodsDetailsCommandsViewSortAscending") || false;
			pageSession.set("MethodsDetailsCommandsViewSortAscending", !sortAscending);
		} else {
			pageSession.set("MethodsDetailsCommandsViewSortAscending", true);
		}
	}
});

Template.MethodsDetailsCommandsViewTable.helpers({
	"tableItems": function() {
		return MethodsDetailsCommandsViewItems(this.method_commands);
	}
});


Template.MethodsDetailsCommandsViewTableItems.rendered = function() {
	
};

Template.MethodsDetailsCommandsViewTableItems.events({
	"click td": function(e, t) {
		e.preventDefault();
		/**/
		return false;
	},

	"click #delete-button": function(e, t) {
		e.preventDefault();
		var me = this;
		bootbox.dialog({
			message: "Delete? Are you sure?",
			title: "Delete",
			animate: false,
			buttons: {
				success: {
					label: "Yes",
					className: "btn-success",
					callback: function() {
						MethodCommands.remove({ _id: me._id });
					}
				},
				danger: {
					label: "No",
					className: "btn-default"
				}
			}
		});
		return false;
	},
	"click #edit-button": function(e, t) {
		e.preventDefault();
		Router.go("methods.details.edit", {methodId: UI._parentData(1).params.methodId, commandId: this._id});
		return false;
	}
});

Template.MethodsDetailsCommandsViewTableItems.helpers({

});
