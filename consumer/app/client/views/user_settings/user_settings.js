//Copyright (c) 2015 wega Informatik AG | Erick Bastidas
//================================
//Company: wega Informatik AG
//Website: http://www.wega-it.com
//Author: Erick Bastidas
//Email: ebastidas3@gmail.com
//================================


Template.UserSettings.rendered = function() {
	
};

Template.UserSettings.events({
	
});

Template.UserSettings.helpers({
	
});

Template.UserSettingsSideMenu.rendered = function() {
	$(".menu-item-collapse .dropdown-toggle").each(function() {
		if($(this).find("li.active")) {
			$(this).removeClass("collapsed");
		}
		$(this).parent().find(".collapse").each(function() {
			if($(this).find("li.active").length) {
				$(this).addClass("in");
			}
		});
	});

	
};

Template.UserSettingsSideMenu.events({
	
});

Template.UserSettingsSideMenu.helpers({
	
});
