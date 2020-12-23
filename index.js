/**
 * Stellar JavaScript SDK
 *
 * Copyright Stellar Loyalty, Inc.
 *
 * Licensed under the Apache License, Version 2.0
 * http://www.apache.org/licenses/LICENSE-2.0
 */

/*
 * Backlog
 *

Next
----
x-browser / robustness
Offer: click to show detail / action

challenges

SSO using client uid cookie
Login: show message on failed login
sign up
edit profile / prefs

error handler wrapper
error handling if jquery doesn't load

API: show proper activity label
activity pagination

Done
----
renew token
wrap ui.refresh in auth check
offers

*/

window.Stellar || (function(window) {

    var jQuery, $;

    // Public scope
    var Stellar= {};

    // Private scope
    var auth,
        ui,
        widgets = {},
        labels,
        api,
        state,
        member,
        util,
        showLog = true,

        // UI labels / config
        // Stellar.init accepts overrides to this object
        labels = {
            hello: "Hello {{short_name}}!",
            login: "Member log in",
            loginButton: "SIGN IN",
            logoutButton: "sign out",
            signUpButton: "REGISTER",
            profileButton: "profile",
            editButton: "EDIT",
            saveButton: "SAVE",
            badgesHeader: "YOUR BADGES",
            challenges: {
                button: "CHALLENGES",
                icon: "star",
                url: "#"
            },
            rewards: {
                button: "REWARDS",
                icon: "gift",
                url: "#"
            },
            spinner: "circle-o-notch",
            activityHeader: 'Your Activity',
            pointsHeader: 'Your Points',
            summaryFields: [
                { attrib: "short_name", source: "identity", label: "Welcome {{value}}!", fields: [
                    { attrib: "member_id", source: "member", label: "Member ID: {{value}}"},
                    { attrib: "current_tier", source: "tiers", label: "Current Tier: {{value}}"},
                    { attrib: "point.balance", source: "metrics", label: "Points: {{value}}", 
                        format: "icons", value: 10, icon: "leaf", color: "green" }
                    //{ attrib: "points", label: "Points: {{value}}", format: "icons", value: 10, icon: "leaf", color: "green" }
                ]}
            ],
            profileFields: [
                // Your Information
                { attrib: "full_name", source: "identity", label: "Your Information", editable: true, fields: [
                    { attrib: "first_name", source: "profile", label: "First Name: {{value}}", type: 'text' },
                    { attrib: "last_name", source: "profile", label: "Last Name: {{value}}", type: 'text' },
                    { attrib: "email", source: "profile", label: "Email: {{value}}", type: 'text', format: "email" },
                    { attrib: "mailing_postal_code", source: "profile", label: "Zip Code: {{value}}", type: 'text'},
                    { attrib: "gender", source: "profile", label: "Gender: {{value}}", type: 'text'},
                ]},
                // Your Membership
                { attrib: "current_tier", source: "profile", label: "Your Membership", editable: false, fields: [
                    { attrib: "member_id", source: "profile", label: "Member ID: {{value}}"},
                    { attrib: "current_tier", source: "profile", label: "Current Tier: {{value}}"},
                    { attrib: "member_since", source: "profile", label: "Member Since: {{value}}", format: "localdate"}
                ]},
                // Your Preferences
                { attrib: "full_name", source: "identity", label: "Your Preferences", editable: true, fields: [
                    { attrib: "receive_email_offers", source: "profile", label: "Receive Email: {{value}}", 
                        type: 'checkbox', format: "booleanToString"},
                    { attrib: "receive_sms_offers", source: "profile", label: "Receive Texts: {{value}}", 
                        type: 'checkbox', format: "booleanToString"},
                    { attrib: "receive_mail_offers", source: "profile", label: "Receive Mail: {{value}}", 
                        type: 'checkbox', format: "booleanToString"}
                ]}
            ],
            activityFields: [
                { attrib: "sl_activity_ts", label: "Date", defaults: new Date().toLocaleDateString(), format: "localdate" },
                { attrib: "sl_type", label: "Activity", defaults: "", format: "type"},
                //{ attrib: "sl_metrics.point", label: "Detail", defaults: "" },
                { attrib: "spend", label: "Spend", defaults: "0", format: "currencyUS" },
                { attrib: "sl_metrics.point", label: "Points", defaults: "0", format: "number" }
            ]
        };

    errorCodes = {
        invalid_grant : 'The username and the password do not match our records.',
        invalid_client : 'Client authentication failed due to unknown client.',
        missing_credentials: 'Missing client credentials',
        cannot_load: 'APIHost not allowed',
        invalid_record: "Email can't be blank.",
        'Internal server error': "Internal server error"
    }

    /**
   * Public SDL / API
   */
    Stellar.init = function (opts) {
        api.init(opts.client); // must call this first
        initResources(function () {
            $ = jQuery = window.jQuery;
            state.load();
            ui.init(opts);
        });
    };


    var facebook = {
        initialized: false,
        perms: 'email,public_profile',

        // state variables
        userId: "me",
        pages: [],
        page: {},
        albums: [],
        album: {},

        init: function() {
            console.debug("facebook preparing fbAsyncInit");
            window.fbAsyncInit = function() {
                FB.init({
                    appId      : api.client.fbAppId,
                    xfbml      : true,
                    version    : 'v2.4',
                    status     : true
                });
                facebook.initialized = true;
            };
            // Load Facebook sdk
            util.loadScript(document, 'script', '//connect.facebook.net/en_US/sdk.js', 'facebook-jssdk', function() {});
        },

        requireLogin: function (callback) {
            if (this.initialized && FB && FB.getLoginStatus) {
                FB.getLoginStatus(function (response) {
                    if (response.status === "connected") {
                        console.debug("facebook user logged in", response);
                        callback(response);
                    }
                    else {
                        FB.login(function (response) { 
                            console.debug("facebooks user logged in", response);
                            callback(response);
                        }, { scope: facebook.perms, enable_profile_selector: true, return_scopes: true } );
                    }
                });
            }
            else {
                window.setTimeout(function () { facebook.requireLogin(callback) }, 500);
            }
        },

        postWallPhoto: function(formdata, callback) {
            callback = callback || emptyFn;
          
            FB.login(function(response) {
                var access_token = response.authResponse.accessToken;
                var opts = {
                    url: 'https://graph.facebook.com/v2.4/me/photos?access_token=' + access_token,
                    method: "POST",
                    data: formdata,
                    async: true,
                    headers: {},
                    processData: false,
                    contentType: false,
                    crossDomain: true,
                    mimeType: "multipart/form-data",
                    success: function (response) {
                        callback(response);
                    },
                    error: function (response) {
                        callback(response);
                    }
                };
                jQuery.ajax(opts);
            }, {scope: 'publish_actions'});
        }

    };

    /**
   * Authentication
   */
    var auth = {
        login : function (opts, callback) {
            opts = opts || {};
            callback = callback || emptyFn;
            log("Stellar.login", opts);
            if (opts.email) {
                member.identity.email = opts.email;
            }
            if (opts.password) {
                member.identity.password = opts.password;
            }
            // After login, fetch the member summary to find his/her name
            api.callOauthToken("password", function() {
                api.callMemberSummary(callback);
            });
        },

        signup: function(opts, callback) {
            opts = opts || {};
            callback = callback || emptyFn;

            opts = {
                first_name: opts.firstName,
                last_name: opts.lastName,
                email: opts.email,
                password: opts.password,
                password_confirmation: opts.confirmPassword
            }

            if (opts.email) {
                member.identity.email = opts.email;
            }
            if (opts.password) {
                member.identity.password = opts.password;
            }

            api.callRegisterMember(opts, function(response) {
        
                if (response.success == true) {
                    api.callOauthToken("password", function() {
                        api.callMemberSummary(callback);
                        widgets.registerBox.find('input').val('');
                    })
                } else {
                    callback();
                }
      
            });
        },

        logout: function () {
            log("Stellar.logout");
            state.clear();
            ui.refresh();
        },

        // is the member logged in with a valid auth_token?
        getLoginStatus: function () {
            return member.isKnown;
        },

        loginFacebook: function(callback) {
            callback = callback || emptyFn;
            facebook.requireLogin(function(response) {
                if (response.status === "connected") {
                    member.provider = "facebook";
                    member.assertion = response.authResponse.accessToken;
                    api.callOauthToken("assertion", function() {
                        api.callMemberSummary(callback);
                    });  
                } else {
                    // Display facebook login error
                    callback();
                }
            });
        }

    };

    // Public
    Stellar.login = auth.login;
    Stellar.logout = auth.logout;
    Stellar.getLoginStatus = auth.getLoginStatus;

    /**
   *  Private Implementation
   */
  
    function loadResources(callback) {
        util.loadStylesheet(document, 'link', '//maxcdn.bootstrapcdn.com/font-awesome/4.3.0/css/font-awesome.min.css', 'stellar-fa')
        if(api.client.css) {
            util.loadStylesheet(document, 'link', api.client.css, 'stellar-css');
            util.loadScript(document, 'script', 'jquery.magnific-popup.min.js', 'stellar-magnific-js', function() {});
            facebook.init();
        }
        callback();
    }

    function initResources (callback) {
        console.debug("initResources", api.client);
        callback = callback || emptyFn;
        var delay = 0;

        if (typeof window.jQuery === 'undefined' || window.jQuery.fn.jquery !== '1.11.3') {
            util.loadScript(document, 'script', '//code.jquery.com/jquery-1.11.3.min.js', 'stellar-jquery', function(){
                loadResources(callback);
            });
        } else {
            loadResources(callback);
        }
    }

    /**
   * Stellar UI
   */
    ui = {

        init: function (opts) {
            opts = opts || {};
            opts.labels = opts.labels || {};
            labels = $.extend(labels, opts.labels);
            widgets = widgets || {};
            // Get the member summary to ensure we have a valid access_token.
            // If the user is not authenticated, then we will still render widgets.
            ui.loginBox();
            ui.require(function(){ return member.summary },
                api.callMemberSummary,
                ui.refresh,
                function () {
                    log("Member Summary could not load");
                    ui.refresh
                });
        },

        render: function () {
            ui.memberSummary();
            ui.offers();
            ui.challenges();
            ui.rewards();
            ui.contentBlock();
            ui.memberProfile();
            ui.activityPanel();
            ui.points();

            ui.contentPage();

            // Demo widgets
            ui.badges();
            ui.activityDemo();
        },

        refresh: function () {
            ui.loginBox();
            ui.render();
        },

        refreshSignUp: function() {
            ui.registerBox();
            ui.render();
        },

        errorMessage: function(type, callback) {
            if (type == null || !(type in errorCodes)) { return };

            var errorBlock = '<div class="error-message">'+errorCodes[type]+'</div>';
            callback(errorBlock);
        },

        loginNotification: function(selector, response) {
    
            if (response.status === 0) {
                ui.errorMessage(response.errorCode, function(msg) {
                    $(selector).html(msg);
                });
            } else {
                var responseJSON = JSON.parse(response.responseText);

                if (responseJSON && responseJSON.error) {
                    response.errorCode = responseJSON.error;
                }

                if (responseJSON && responseJSON.message) {
                    $(selector).html('<div class="error-message">'+responseJSON.message+'</div>');  
                }
                else {
                    ui.errorMessage(response.errorCode, function(msg) {
                        $(selector).html(msg);
                    });
                }
            }
        }, 
    
        loginBox: function (callback) {
            callback = callback || emptyFn;
            var w = widgets.stellarLogin = $('.stellar-login');
            w.hide();
            if (w.length) {
                if (!widgets.spinner) {
                    widgets.spinner = $('<i class="fa fa-spin fa-'+labels.spinner+'"></i>').appendTo(w)
                }
                widgets.spinner.hide();
                // show username box if known, or login box if unknown
                if (member.isKnown) {
                    // enter
                    if (!widgets.userBox) {
                        widgets.userBox = $('<div class="stellar-user-box"></div>').appendTo(w)
                        widgets.usernameLabel = $('<span class="stellar-username"></span>').appendTo(widgets.userBox)
                        widgets.logoutButton = $('<a class="stellar-logout-button">'+
                                //'<i class="fa fa-sign-out"></i> '+
                                labels.logoutButton+'</a>').appendTo(widgets.userBox)
                        widgets.logoutButton.click(function(evt) {
                            widgets.spinner.fadeIn();
                            widgets.userBox.hide();
                            auth.logout({}, function () { ui.refresh() });
                        });
                    }
                    // update
                    if (widgets.loginBox) { widgets.loginBox.hide() }
                    widgets.usernameLabel.text(ui.replaceNameTokens(labels.hello))
                    widgets.userBox.fadeIn()
                }
                else {
                    if (!widgets.loginBox) {
                        widgets.loginBox = $('<form action="." onsubmit="return false;"></form>').appendTo(w)
                        widgets.notification = $('<div class="stellar-login-notification"></div>').appendTo(widgets.loginBox);
                        widgets.loginLabel = $('<span class="stellar-login-label">'+labels.login+'</span>').appendTo(widgets.loginBox)
                        $('<span> </span>').appendTo(widgets.loginBox);
                        widgets.loginEmail = $('<input class="stellar-login-email" value="" placeholder="username" />').appendTo(widgets.loginBox)
                        $('<span> </span>').appendTo(widgets.loginBox);
                        widgets.loginPassword = $('<input class="stellar-login-password" value="" placeholder="password" />').appendTo(widgets.loginBox)
                        $('<span> </span>').appendTo(widgets.loginBox);
                        widgets.loginButton = $('<button class="stellar-login-button">'+
                               // '<i class="fa fa-sign-in"></i> '+
                               labels.loginButton+'</button>').appendTo(widgets.loginBox)
                            .click(function(evt) {
                                widgets.spinner.fadeIn();
                                if (widgets.loginBox) { widgets.loginBox.hide() }

                                auth.login({ email: widgets.loginEmail.val() || "jfreeman@mailto.sent.com",
                                    password: widgets.loginPassword.val() || "password" }, function() {
                                    ui.refresh();
                                });
                            })

                        $('<span> </span>').appendTo(widgets.loginBox);
                        widgets.singUpButton = $('<button class="stellar-signup-button">'+
                                    labels.signUpButton+'</button>').appendTo(widgets.loginBox)
                            .click(function(evt) {
                                widgets.spinner.fadeIn();
                                if (widgets.loginBox) { widgets.loginBox.hide() }
                                widgets.notification.text('');
                                widgets.loginBox.find('input').val('');
                                // ui.refresh();
                                ui.registerBox();
                            })
             
                        $('<span class="stellar-login-spacer"> </span>').appendTo(widgets.loginBox);
                        widgets.loginFacebook = $('<button class="stellar-facebook-button">'+
                                      '<i class="fa fa-facebook fa-lg"></i>'+
                                      '</button>').appendTo(widgets.loginBox)
                            .click(function(e) {
                                widgets.spinner.fadeIn();
                                if (widgets.loginBox) { widgets.loginBox.hide() }
              
                                auth.loginFacebook(function() {
                                    ui.refresh();
                                });
                            });

                        widgets.loginGoogle = $('<button class="stellar-google-button">'+
                                      '<i class="fa fa-google-plus fa-lg"></i>'+
                                      '</button>').appendTo(widgets.loginBox)
                    }
                    // update
                    if (widgets.userBox) { widgets.userBox.hide() }
                    widgets.loginBox.fadeIn();
                }
                // show
                w.fadeIn("slow");
            }
            callback();
        },

        registerBox: function (callback) {
            callback = callback || emptyFn;
            var w = widgets.stellarRegistration = $('.stellar-login');
            w.hide();
            if (w.length) {
                if (!widgets.spinner) {
                    widgets.spinner = $('<i class="fa fa-spin fa-'+labels.spinner+'"></i>').appendTo(w)
                }
                widgets.spinner.hide();

                if (member.isKnown) {
                    // enter
                    if (!widgets.userBox) {
                        widgets.userBox = $('<div class="stellar-user-box"></div>').appendTo(w)
                        widgets.usernameLabel = $('<span class="stellar-username"></span>').appendTo(widgets.userBox)
                        widgets.logoutButton = $('<a class="stellar-logout-button">'+
                                //'<i class="fa fa-sign-out"></i> '+
                                labels.logoutButton+'</a>').appendTo(widgets.userBox)
                        widgets.logoutButton.click(function(evt) {
                            widgets.spinner.fadeIn();
                            widgets.userBox.hide();
                            auth.logout({}, function () { ui.refresh() });
                        });
                    }
                    // update
                    if (widgets.loginBox) { widgets.loginBox.hide() }
                    widgets.usernameLabel.text(ui.replaceNameTokens(labels.hello))
                    widgets.userBox.fadeIn()
                }
                else {

                    if (!widgets.registerBox) {
                        widgets.registerBox = $('<form action="." onsubmit="return false;" id="stellar-register-form"></form>').appendTo(w);
                        widgets.notification = $('<div class="stellar-signup-notification"></div>').appendTo(widgets.registerBox);
                        widgets.registerLabel = $('<span class="stellar-register-title">Create an account</span>').appendTo(widgets.registerBox);
                        widgets.firstName = $('<input type="text" class="stellar-reg-firstname" placeholder="First Name">').appendTo(widgets.registerBox);
                        widgets.lastName = $('<input type="text" class="stellar-reg-lastname" placeholder="Last Name">').appendTo(widgets.registerBox);
                        widgets.email = $('<input type="text" class="stellar-reg-email" placeholder="Email">  ').appendTo(widgets.registerBox);
                        widgets.password = $('<input type="text" class="stellar-reg-password" placeholder="Password">').appendTo(widgets.registerBox);
                        widgets.confirmPassword = $('<input type="text" class="stellar-reg-confirm-password" placeholder="Confirm Password">  ').appendTo(widgets.registerBox);
                        widgets.signUpButton = $('<button class="stellar-register-button">SIGN UP</button>').appendTo(widgets.registerBox)
                            .click(function(evt) {
                                widgets.spinner.fadeIn();

                                if (widgets.registerBox) { widgets.registerBox.hide() }

                                auth.signup({
                                    firstName: widgets.firstName.val(), 
                                    lastName: widgets.lastName.val(),
                                    email: widgets.email.val(),
                                    password: widgets.password.val(),
                                    confirmPassword: widgets.confirmPassword.val()
                                }, function() {
                                    ui.refreshSignUp();    
                                });
                
                
                            });
                        widgets.signInLabel = $('<p>Already Have an account?</p>').appendTo(widgets.registerBox);
                        widgets.singInButton = $('<button class="stellar-signin-button">SIGN IN</button>').appendTo(widgets.registerBox)
                            .click(function(evt) {
                                widgets.spinner.fadeIn();
                                if (widgets.registerBox) { widgets.registerBox.hide() }
                                widgets.notification.text('');
                                widgets.registerBox.find('input').val('');
                                ui.refresh();
                            });
                    }

                    if (widgets.userBox) { widgets.userBox.hide() }
                    if (widgets.loginBox) { widgets.loginBox.hide() }

                    widgets.registerBox.fadeIn();
                }
            }

            w.fadeIn("slow");

            callback();
        },

        // Summary Widget
        memberSummary: function (callback, w) {
            if (!w) { return ui.initMemberSummary('.stellar-summary', callback || emptyFn) }
            // enter
            if (!widgets.summaryFieldElements) {
                widgets.summaryFieldElements = {};
                ui.enterFieldGroups(w, labels.summaryFields, widgets.summaryFieldElements);
            }
            // update
            ui.updateFieldGroups(labels.summaryFields, widgets.summaryFieldElements);
            // show
            w.fadeIn("slow");
        },
        initMemberSummary: function (selector, callback) {
            callback = callback || emptyFn;
            var w = $(selector);
            w.hide();
            if (w.length && member.isKnown) {
                ui.require(function(){ return member.summary },
                    api.callMemberSummary,
                    function(){ ui.memberSummary(callback, w) },
                    callback);
            }
        },

        // Profile Widget
        memberProfile: function (callback, w) {
            if (!w) { return ui.initMemberProfile('.stellar-profile', callback || emptyFn) }
            // enter
            if (!widgets.profileFieldElements) {
                widgets.profileFieldElements = {};
                ui.enterFieldGroups(w, labels.profileFields, widgets.profileFieldElements, /* editable */ true);
            }
            // update
            ui.updateFieldGroups(labels.profileFields, widgets.profileFieldElements);
            // show
            w.fadeIn("slow");
        },
        initMemberProfile: function (selector, callback) {
            callback = callback || emptyFn;
            var w = $(selector);
            w.hide();
            if (w.length && member.isKnown) {
                ui.require(function(){ return member.profile },
                    api.callMemberProfile,
                    function(){ ui.memberProfile(callback, w) },
                    callback);
            }
        },

        // Activity Panel
        activityPanel: function (callback, w) {
            if (!w) { return ui.initActivityPanel('.stellar-activity', callback || emptyFn) }
            // enter
            var activities = member.activities;
            //log("memberactivities", activities)
            if (!w.hasClass("stellar-box")) {
                w.addClass("stellar-box");
                var header = $('<div class="stellar-header"></div>').appendTo(w)
                var btn = $('<a class="stellar-header-action">'+
                    '<i class="fa fa-'+labels.challenges.icon+'"></i> '+
                    labels.challenges.button+'</a>').appendTo(header);

                $('<div class="stellar-fieldgroup"></div>').text(labels.activityHeader).appendTo(header);
                var table = $('<table class="stellar-table"></table>').appendTo(w);
                var th = $('<tr></tr>').appendTo(table);
                labels.activityFields.forEach(function (field) {
                    $('<th></th>')
                        .addClass('stellar-field-'+(field.format || "text"))
                        .text(field.label)
                        .appendTo(th);
                });
                activities.forEach(function (activity) {
                    var tr = $('<tr></tr>').appendTo(table);
                    labels.activityFields.forEach(function (field) {
                        var value,
                            attrib = field.attrib.split("."),
                            value = activity[attrib[0]];
                        if (attrib.length > 1) {
                            value = value[attrib[1]];
                        }
                        value = ui.formatField(field, value || field.defaults);
                        $('<td></td>')
                            .addClass('stellar-field-'+(field.format || "text"))
                            .text(value)
                            .appendTo(tr);
                    });
                });
                $('<div class="stellar-spacer"></div>').appendTo(w);
            }
            // show
            w.fadeIn("slow");
        },
        initActivityPanel: function (selector, callback) {
            callback = callback || emptyFn;
            var w = $(selector);
            w.hide();
            if (w.length && member.isKnown) {
                ui.require(function(){ return member.activities },
                    api.callActivities,
                    function(){ ui.activityPanel(callback, w) },
                    callback);
            }
        },

        // Offers -- show an offer
        offers: function (callback, w) {
            callback = callback || emptyFn;
            if (!w) { return ui.initOffers('.stellar-offers', callback || emptyFn) }

            // enter
            ui.enterWidgetBlock(w, member.offers, callback, 'OFFERS');
            // update
            // show
            w.fadeIn("slow");
        },
        initOffers: function (selector, callback) {
            callback = callback || emptyFn;
            var w = $(selector);
            w.hide();
            if (w.length && member.isKnown) {
                var config = { layout: w.attr("data-layout") || "medium_rectangle" };
                var offerId = w.attr("data-id");
                if (offerId) {
                    config.id = offerId;
                }
        
                ui.require(function(){ return member.offers && member.offers[config.id || config.layout] },
                    function(callback2) { api.callOffers(config, callback2) },
                    function(){ ui.offers(callback, w) },
                    callback);
            }
        },

        // Challenges -- show a challenge
        challenges: function (callback, w) {
            callback = callback || emptyFn;
            if (!w) { return ui.initChallenges('.stellar-challenges', callback || emptyFn) }

            // enter
            ui.enterWidgetBlock(w, member.challenges, callback, 'CHALENGES');
            // update
            // show
            w.fadeIn("slow");
        },
        initChallenges: function (selector, callback) {
            callback = callback || emptyFn;
            var w = $(selector);
            w.hide();
            if (w.length && member.isKnown) {
                var config = { layout: w.attr("data-layout") || "medium_rectangle" };
                var challengeId = w.attr("data-id");
                if (challengeId) {
                    config.id = challengeId;
                }
       
                ui.require(function(){ return member.challenges && member.challenges[config.id || config.layout] },
                    function(callback2) { api.callChallenges(config, callback2) },
                    function(){ ui.challenges(callback, w) },
                    callback);
            }
        },

        // Rewards -- show a reward
        rewards: function (callback, w) {
            callback = callback || emptyFn;
            if (!w) { return ui.initRewards('.stellar-rewards', callback || emptyFn) }

            // enter
            ui.enterWidgetBlock(w, member.rewards, callback, 'REWARDS');
            // update
            // show
            w.fadeIn("slow");
        },
        initRewards: function (selector, callback) {
            callback = callback || emptyFn;
            var w = $(selector);
            w.hide();
            if (w.length && member.isKnown) {
                var config = { layout: w.attr("data-layout") || "medium_rectangle" };
                var rewardId = w.attr("data-id");
                if (rewardId) {
                    config.id = rewardId;
                }
       
                ui.require(function(){ return member.rewards && member.rewards[config.id || config.layout] },
                    function(callback2) { api.callRewards(config, callback2) },
                    function(){ ui.rewards(callback, w) },
                    callback);
            }
        },

        // Content Block -- show a content block
        contentBlock: function (callback, w) {
            callback = callback || emptyFn;
            if (!w) { return ui.initContentBlock('.stellar-content-block', callback || emptyFn) }
            // enter
            ui.enterWidgetBlock(w, member.contentBlock, callback, 'CONTENT BLOCK');
            // update
            // show
            w.fadeIn("slow");
        },
        initContentBlock: function (selector, callback) {
            callback = callback || emptyFn;
            var w = $(selector);
            w.hide();
            if (w.length && member.isKnown) {
                var config = { layout: w.attr("data-layout") || "medium_rectangle" };
                var contentBlockId = w.attr("data-id");
                if (contentBlockId) {
                    config.id = contentBlockId;
                }
       
                ui.require(function(){ return member.contentBlock && member.contentBlock[config.id || config.layout] },
                    function(callback2) { api.callContentBlock(config, callback2) },
                    function(){ ui.contentBlock(callback, w) },
                    callback);
            }
        },


        // Content Page -- show a content page
        contentPage: function (callback, w) {
            callback = callback || emptyFn;
            if (!w) { return ui.initContentPage('.stellar-content-page', callback || emptyFn) }
            // enter
            ui.enterWidgetBlock(w, member.contentPage, callback, 'CONTENT PAGE');
            // update
            // show
            w.fadeIn("slow");

        },
        initContentPage: function (selector, callback) {
            callback = callback || emptyFn;
            var w = $(selector);
            w.hide();
            if (w.length) {
                var config = {};
                var config = { layout: w.attr("data-layout") || "medium_rectangle" };
                // var contentBlockId = w.attr("data-id");
                // if (contentBlockId) {
                //   config.id = contentBlockId;
                // }
                ui.require(function(){ return member.contentPage },
                    function(callback2) { api.callContentPage(config, callback2) },
                    function(){ ui.contentPage(callback, w) },
                    callback);
            }
        },

        enterWidgetBlock: function (w, data, callback, name) {
            var layout = w.attr("data-layout") || "medium_rectangle";
            var id = w.attr("data-id");
            var offer;

            if (id) {
                log("selecting offer by ID", id);
                offer = [ data[id] ];
            }
            else {
                log("selecting offer randomly");
                offer = data[layout];
                offer = [ util.arrayChoice(offer, function (d) { return d.html ? 1 : 0 }) ];
            }

            if (!w.hasClass("stellar-contentvis")) {
                w.addClass("stellar-contentvis");
                offer.forEach(function (d) {
                    console.debug(name, d);
                    if (d.html) {
                        var url = d.image_url;
                        var snippet = ui.getSnippet(d.html);
            
                        var running = false;
                        snippet.find('.stl_content').click(function(){
                            if (running) { return }
                            running = true;
                            var id = $(this).attr('parentid');

                            api.callChallenges({id: id}, function(response) {

                                var popup = {};
                                popup.box = $('<div class="white-popup"></div>');

                                popup.snippet = ui.getSnippet(response.data.html);
                                popup.snippet.css('margin', '0 auto');
                                popup.snippet.appendTo(popup.box);

                                popup.btn = $('<button class="sl-respond">Enter</button>').appendTo(popup.box);
                                popup.btn.css('margin-top', '20px');
                                popup.btn.click(function() {
                                    var template = ui.challengesFormTemplate(response.data);
                                    ui.openMagnificPopup(template);
                                });
                                ui.openMagnificPopup(popup.box);
                                running = false;
                            });
                        });

                        if (snippet) {
                            ui.frame(w, snippet, function () {
                                ui.showDetails(d);
                            });
                        }
                    }
                });
            }
        },

        showDetails: function(d, callback) {
            ui.getContentType(d, function(type) {
                ui.showWidgetContent(d, type, callback);
            });
        },

        getContentType: function(d, callback) {
            var d = d || {};
            var type;

            if (d.hasOwnProperty('response_type')) {
                type = 'challenges';
            } else if (d.hasOwnProperty('redeemable')) {
                type = 'rewards';
            } else if (d.hasOwnProperty('barcode')) {
                type ='offers';
            } else {
                type = 'content_blocks';
            }
            callback(type);
        },

        showWidgetContent: function(d, type, callback) {
            var popup = document.createElement('div');
            popup.className = 'white-popup';

            var wrapper = $('<div class="dialog-'+type+'"></div>');

            var content = ui.getContent(d);
            wrapper.append(content);

            if (type == 'rewards') {
                btn = $('<button class="sl-respond">REDEEM</button>').appendTo(wrapper);
                btn.click(function(e) {
                    e.preventDefault();
                    var template = ui.rewardsFormTemplate(d);
                    ui.openMagnificPopup(template);
                })
            }
            if (type == 'challenges') {
                btn = $('<button class="sl-respond">ENTER</button>').appendTo(wrapper);
                btn.click(function(e) {
                    e.preventDefault();
                    var template = ui.challengesFormTemplate(d);
                    ui.openMagnificPopup(template);
                })
            }

            wrapper.appendTo(popup);
            ui.openMagnificPopup(popup);
        },

        getContent: function(d) {
            var d = d || {},
                display = ['image_url', 'heading', 'start_period', 'award_amount', 'body', 'details'],
                html = '';
            for (i in display) {
                if (d.hasOwnProperty(display[i])) {
                    if (display[i] == 'image_url' && d[display[i]]) {
                        html += '<img src="' + d[display[i]] + '" />';
                    } else if (d[display[i]]) {
                        html += '<div class="sl-' + [display[i]]  + '">' + d[display[i]] + '</div>';
                    }
                }
            }
            return html;
        },

        challengesFormTemplate: function(d, callback) {
            var d = d || {};
            var html = '';

            var popup = document.createElement('div');
            popup.className = 'white-popup';

            var image_url = !d.response_setting.image_url ? '' : $('<img src="'+d.response_setting.image_url+'" alt="challange image" />').appendTo(popup);
            var question = !d.response_setting.question ? '' : $('<div>'+d.response_setting.question+'</div>').appendTo(popup);
            var answer = d.response_type !== 'survey' ? '' : $('<div class="survey-question"></div>').html(ui.checkSurveyType(d.response_setting)).appendTo(popup);
          
            if (d.response_type == 'photo' || d.response_type == 'video' || d.response_type == 'facebook') {
                var answer = $('<input type="text" name="answer[text]" placeholder="Please enter a caption"/>').appendTo(popup);
                var file = $('<input type="file" name="answer[attachment]" />').appendTo(popup);
            }

            if (d.response_type == 'facebook') {
                var assets = d.response_setting.assets;
                var image_list = $('<div id="facebook-image-list">');
                for (var i=0; i < assets.length; i++) {
                    var img = $('<img src="'+assets[i]+'" alt="facebook-challenge"/>').appendTo(image_list);
                }
                image_list.appendTo(popup);
            }

            var msg = $('<div class="form-message"></div>').appendTo(popup);

            var btn = $('<button>Submit</button>').appendTo(popup)

                .click(function(e) {

                    var answer = $(popup).find('input[name="answer[text]"]').val();
                    var attachment = $(popup).find('input[name="answer[attachment]"]').prop('files');

                    var formdata = new FormData();

                    formdata.append("answer[text]", answer );
                    formdata.append("answer[attachment]", attachment[0] || '');

                    if (d.response_type == 'facebook') {
                        var formdata2 = new FormData();
                        formdata2.append('caption', answer);
                        formdata2.append('source', attachment[0] || '');

                        facebook.postWallPhoto(formdata2, callback);
                    }

                    var config = { id: d.id, formData: formdata };
                    var waiting = true;

                    if (waiting) {
                        $(btn).attr('disabled', 'disabled');
                    }

                    api.callRespondChallenge(config, function(response){
                        waiting = false;

                        if(!waiting) {
                            $(btn).removeAttr('disabled');
                        }

                        if(!response.responseText) {
                            window.setTimeout(function() {
                                $('.form-message').html('Thank you for responding!');  
                                $.magnificPopup.close(); 
                                ui.refresh();
                            }, 3000);
                        } else {
                            if (!response.responseJSON.message) {
                                $('.form-message').html(response.responseJSON.error);
                            } else {
                                $('.form-message').html(response.responseJSON.message);  
                            }
                        }
                
                    });


                });

            return popup;
        },

        rewardsFormTemplate: function(d) {
            var d = d || {};
            var html = '';

            var el = document.createElement('div');
            el.className = 'white-popup';


            html += '<input type="text" name="address[street_address]" placeholder="Street Address">'+
                '<input type="text" name="address[city]" placeholder="City">'+
                '<input type="text" name="address[state]" placeholder="State">'+
                '<input type="text" name="address[country_code]" placeholder="Country Code">'+
                '<input type="text" name="address[zip_code]" placeholder="Zip Code">';
            var form = $('<form>', {
                "class": 'sl-content-type',
                "html": html + '<input type="submit" value="SUBMIT" /> <div class="form-message"></div>',
            }).appendTo(el).submit(function(e) {
                e.preventDefault();
                var _this = this;

                //add confirm message
                ui.redeemRewards(_this, form, d);
        
                return false;
            });

            return el;
        },

        submitChallenge: function(_this, form, d) {
            var waiting = true,
                formData = new FormData(_this),
                config = { id: d.id, formData: formData };

            if (d.response_type == 'facebook') {
                console.log(formData.get('answer[text]'));
                return false;
            }

            if (waiting) {
                form.find('input[type="submit"]').attr('disabled', 'disabled');
            }

            api.callRespondChallenge(config, function(response){
                waiting = false;

                if(!waiting) {
                    form.find('input[type="submit"]').removeAttr('disabled');
                }

                if(!response.responseText) {
                    window.setTimeout(function() {
                        $('.form-message').html('Thank you for responding!');  
                        $.magnificPopup.close(); 
                        ui.refresh();
                    }, 3000);
                } else {
                    if (!response.responseJSON.message) {
                        $('.form-message').html(response.responseJSON.error);
                    } else {
                        $('.form-message').html(response.responseJSON.message);  
                    }
                }
        
            });
        },

        redeemRewards: function(_this, form, d) {
            var waiting = true,
                formData = new FormData(_this),
                config = { id: d.id, formData: formData };

            if (waiting) {
                form.find('input[type="submit"]').attr('disabled', 'disabled');
            }

            api.callRedeemRewards(config, function(response){
                waiting = false;

                if(!waiting) {
                    form.find('input[type="submit"]').removeAttr('disabled');
                }

                if(!response.responseText) {
                    window.setTimeout(function() {
                        $('.form-message').html('Thank you for responding!');  
                        $.magnificPopup.close(); 
                    }, 3000);
                } else {
                    if (!response.responseJSON.message) {
                        $('.form-message').html(response.responseJSON.error);
                    } else {
                        $('.form-message').html(response.responseJSON.message);  
                    }
                }
            });
        },


        checkSurveyType: function(res) {
            var fieldType;
            var input = '';

            if (res.question_type == 'numeric' || res.question_type == 'rating') {
                fieldType = 'number';
            } 

            if (res.question_type == 'text') {
                fieldType = 'text'
            }

            if (res.question_type == 'multiple_choice') {
                fieldType = 'checkbox'
            }

            if (res.question_type == 'multiple_choice' && res.survey_options) {
                $.each( res.survey_options, function( key, value ) {
                    input += '<label for="sl-'+value+'" ><input type="checkbox" name="answer[text][]" value="'+value+'" id="sl-'+value+'" /> '+value+' </label> ';
                });
            } else {
                input += '<input type="' + fieldType + '" name="answer[text]" />';
            }
            return input;
        },
    
        formTemplates: function(d) {
            var type = d.response_type;
            var tmp;
      
            var formTemplateType = {
                survey: {
                    numeric: "<input type='number' name='answer[text]' />",
                    text: "<input type='text' name='answer[text]' />",
                    rating: "<input type='number' name='answer[text]' min='1' max='5' />",
                }, 
                photo: '<input type="text" name="answer[text]" placeholder="Please enter a caption"/> <input type="file" name="answer[attachment]" />',
                video: '<input type="text" name="answer[text]" /> <input type="file" name="answer[attachment]" />'
            };

            if (d.response_setting.question_type) {
                var tmp = '';        

                if(d.response_setting.image_url) {
                    tmp += "<img src='"+d.response_setting.image_url+"' />";  
                }

                if (d.response_setting.question) {
                    tmp += "<div>"+d.response_setting.question+"</div>";
                }


                if (d.response_setting.question_type == 'multiple_choice') {
                    $.each( d.response_setting.survey_options, function( key, value ) {
                        tmp += '<label for="sl-'+value+'" ><input type="checkbox" name="answer[text][]" value="'+value+'" id="sl-'+value+'" /> '+value+' </label> ';
                    });
                } else {
                    tmp += formTemplateType[type][d.response_setting.question_type];
                }

            } else {
                var tmp = formTemplateType[type];
            }

            var el = document.createElement('div');
            el.className = 'white-popup';

            var form = $('<form>', {
                "class": 'sl-content-type',
                "html": tmp + '<input type="submit" value="Submit" /> <div class="form-message"></div>',
            }).appendTo(el).submit(function(e) {
                e.preventDefault();

                var waiting = true,
                    formData = new FormData(this),
                    config = { id: d.id, formData: formData };

                if (waiting) {
                    form.find('input[type="submit"]').attr('disabled', 'disabled');
                }

                api.callRespondChallenge(config, function(response){
                    waiting = false;

                    if(!waiting) {
                        form.find('input[type="submit"]').removeAttr('disabled');
                    }

                    if(!response.responseText) {
                        $('.form-message').html('Thank you for responding!');
            
                        window.setTimeout(function() {
                            $.magnificPopup.close(); 
                        }, 3000);
                    } else {
                        if (!response.responseJSON.message) {
                            $('.form-message').html(response.responseJSON.error);
                        }else {
                            $('.form-message').html(response.responseJSON.message);  
                        }
                    }
          
                });
        
                return false;
            });
          
            return el;
        },

        openMagnificPopup: function(template) {
            var tpl = template;
            $.magnificPopup.open({
                items: {
                    src: tpl,
                    type: 'inline'
                },
                closeBtnInside: true,
                closeOnBgClick: false
            });
        },

        //
        // Demo Widgets
        //

        activityDemo: function (callback) {
            callback = callback || emptyFn;
            var w = $('.stellar-activity-demo');
            w.hide();
            if (member.isKnown && w.length) {
                // require
                var activities = member.demo.activities;

                // enter
                if (!w.hasClass("stellar-box")) {;
                    w.addClass("stellar-box");
                    var header = $('<div class="stellar-header"></div>').appendTo(w)
                    var btn = $('<a class="stellar-header-action" href="'+labels.challenges.url+'">'+
                      '<i class="fa fa-'+labels.challenges.icon+'"></i> '+
                      labels.challenges.button+'</a>').appendTo(header)
                    $('<div class="stellar-fieldgroup"></div>').text(labels.activityHeader).appendTo(header);
                    var table = $('<table class="stellar-table"></table>').appendTo(w);
                    var th = $('<tr></tr>').appendTo(table);
                    labels.activityFields.forEach(function (field) {
                        $('<th></th>')
                            .addClass('stellar-field-'+(field.format || "text"))
                            .text(field.label)
                            .appendTo(th);
                    });
                    activities.forEach(function (activity) {
                        var tr = $('<tr></tr>').appendTo(table);
                        labels.activityFields.forEach(function (field) {
                            $('<td></td>')
                                .addClass('stellar-field-'+(field.format || "text"))
                                .text(activity[field.attrib] || field.defaults)
                                .appendTo(tr);
                        });
                    });
                    $('<div class="stellar-spacer"></div>').appendTo(w);
                }
                // update
                // show
                w.fadeIn("slow");
            }
        },

        points: function (callback, w) {
            callback = callback || emptyFn;
            if (!w) { return ui.initPoints('.stellar-points-demo', callback || emptyFn) }
            var points = member.demo.points;
            // enter
            if (!widgets.pointsBarNext) {;
                w.addClass("stellar-box");
                var header = $('<div class="stellar-header"></div>').appendTo(w)
                var btn = $('<a class="stellar-header-action" href="'+labels.rewards.url+'">'+
                    '<i class="fa fa-'+labels.rewards.icon+'"></i> '+
                    labels.rewards.button+'</a>').appendTo(header)
                $('<div class="stellar-fieldgroup"></div>').text(labels.pointsHeader).appendTo(header);
                var pct = Math.round(100*points.current / points.next) || 10;
                var bar = $('<div class="stellar-points-bar"></div>').appendTo(w);
                widgets.pointsBarNext = $('<div class="stellar-points-bar-next"></div>').appendTo(bar);
                widgets.pointsBarCurrent = $('<div class="stellar-points-bar-current" style="width:'+pct+'%"></div>').appendTo(bar);
                if (w.attr("badges")) {
                    $('<div class="stellar-badges"></div>').appendTo(w);
                }
                $('<div class="stellar-spacer"></div>').appendTo(w);
            }
            // update
            widgets.pointsBarNext.text(points.next);
            widgets.pointsBarCurrent.text(points.current);
            // show
            w.fadeIn("slow");
        },
        initPoints: function (selector, callback) {
            callback = callback || emptyFn;
            var w = $(selector);
            w.hide();
            if (w.length && member.isKnown) {
                ui.require(function(){ return member.demo.points },
                    api.callMemberProfile,
                    function(){ ui.points(callback, w) },
                    callback);
            }
        },

        badges: function (callback, w) {
            callback = callback || emptyFn;
            if (!w) { return ui.initBadges('.stellar-badges', callback || emptyFn) }
            var badges = member.demo.badges;
            // enter
            if (!w.hasClass("stellar-badges-box")) {;
                w.addClass("stellar-badges-box");
                $('<div class="stellar-badges-label">'+labels.badgesHeader+'</div>').appendTo(w);
                badges.forEach(function (badge) {
                    $('<span class="fa-stack fa-2x" style="color:'+badge.color+'" title="'+badge.name+'">'+
              '<i class="fa fa-circle-thin fa-stack-2x"></i>'+
              '<i class="fa fa-'+badge.icon+' fa-stack-1x"></i>'+
            '</span>').appendTo(w);
                });
            }
            // update
            // show
            w.fadeIn("slow");
        },
        initBadges: function (selector, callback) {
            callback = callback || emptyFn;
            var w = $(selector);
            w.hide();
            if (w.length && member.isKnown) {
                ui.require(function(){ return member.demo.badges },
                    api.callMemberProfile,
                    function(){ ui.badges(callback, w) },
                    callback);
            }
        },

        // 
        // UI helper functions
        //

        getSnippet: function (html) {
            // Workaround H2 bug
            // This is to work around an old bug in the content editor that
            // included an H2 tag before the stl_content element.
            var snippet = $(html);
            log("initial snippet=", snippet);
            if (snippet[0].nodeName !== "DIV") {
                snippet = $(snippet[2]);
                log ("fixed snippet", snippet);
            }
            // Assert that the snippet has the proper stl_content clas
            if (!snippet.hasClass("stl_content")) {
                log("frameSnippet", "ERROR - invalid snippet", snippet);
                return null;
            }
            return snippet;
        },

        frame: function (w, content, clickHandler) {
            var ctheight = content.css('height');
            var ctwidth = content.css('width');
            if (ctheight === '0px') { ctheight = 'auto' };
            if (ctwidth === '0px') { ctwidth = 'auto' };
            clickHandler = clickHandler || emptyFn;
            var iframe = $('<iframe scrolling="no"></iframe>')
                .addClass("stellar-contentvis")
                .css('height', ctheight)
                .css('width', ctwidth)
                .appendTo(w)
            // Fix for missing style on image1
            var image1 = content.children(".stl_image1");
            if (image1.css("position") === "absolute" && ! image1.css("overflow")) {
                image1.css("overflow", "hidden");
            }
            iframe.ready(function() {
                var body = iframe.contents().find("body");
                if (w.selector !== '.stellar-content-page') {
                    body.click(clickHandler);
                }
                // reset
                body.css("margin", 0)
                var wrapper = $('<div class="js_sdk_wrapper"></div>').appendTo(body).html(content)
                // Get the height after the newly injected content renders...
                setTimeout(function() { iframe.height(body.height()) }, 50);
            });
        },

        require: function (validate, fetch, success, fallback) {
            if (validate()) {
                return success();
            }
            else {
                fetch(function () {
                    if (validate()) {
                        return success();
                    }
                    else {
                        return fallback();
                    }
                });
                return;
            }
        },

        getFieldValue: function (d) {
            if (d.override) { return d.override }
            var source = ui.getSource(d) || {};
            var attrib = d.attrib.split(".");
            var rtn = source[attrib[0]];
            if (attrib.length > 1) {
                rtn = rtn[attrib[1]];
            }
            return rtn || "";
        },

        getSource: function (d) {
            if (!d.source || d.source === "identity") {
                return member.identity;
            }
            else if (d.source === "profile") {
                return member.profile;
            }
            else if (d.source === "member" && member.summary) {
                return member.summary.member;
            }
            else if (d.source === "metrics" && member.summary) {
                return member.summary.metrics;
            }
            else if (d.source === "tiers" && member.summary) {
                return member.summary.tiers;
            }
        },

        replaceNameTokens: function (value) {
            return value.replace("{{short_name}}", member.identity.short_name)
                .replace("{{full_name}}", member.identity.full_name)
        },

        formatField: function (field, value) {
            if (field.format && ui.formatters[field.format]) {
                try {
                    return ui.formatters[field.format](value);
                } catch (e) {
                    log("error formatting value", field.format, value);
                }
            }
            return value;
        },

        formatters: {
            "localdate": function (value) {
                var dt = new Date(value || "");
                if (isNaN(dt.getTime())) { return "" }
                return dt.toLocaleDateString();
            },
            "currencyUS": function (value) {
                value = +(value || 0);
                return value.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,');
            },
            "currencyEUR": function (value) {
                value = value || 0;
                return +value.toFixed(2).replace('.',',').replace(/\d(?=(\d{3})+\.)/g, '$&.');
            },
            "type": function (value) {
                return value;
                //value = value || '';
                //value = value.replace(/_/g, ' ')
                //return value.charAt(0).toUpperCase() + value.slice(1); 
            },
            "icons": function (value) {
                var s = '<span style="color: '+d.color+'">';
                for (var i=0; i<value; i++) {
                    s += '<i class="fa fa-'+d.icon+'"></i>';
                }
                s += '</span>';
                return s;
            },
            "booleanToString": function(value) {
                if (value === true) { value = 'yes' }
                else if (value === false || value == "") { value = 'no' }
                else { return value }
                return value;
            }
        },

        enterFieldGroups: function (container, fieldLabels, fieldElements) {
            var i = 0;
            fieldLabels.forEach(function(fieldGroup) {
                fieldGroup.fieldId = "fg"+i++;
                var editable = fieldGroup.editable;
                var box = $('<div class="stellar-box"></div>').appendTo(container)
                var header = $('<div class="stellar-header"></div>').appendTo(box)
                if (editable) {
                    var editButton = $('<a class="stellar-header-action">'+
                                '<i class="fa fa-edit"></i> '+
                                labels.editButton+'</a>').appendTo(header)
                    var saveButton = $('<a class="stellar-header-action">'+
                                '<i class="fa fa-floppy-o"></i> '+
                                labels.saveButton+'</a>').appendTo(header)

                    saveButton.css('display', 'none');

                    editButton.click(function(evt) { 
                        ui.editFieldGroups(fieldGroup, fieldElements);
                        editButton.hide();
                        saveButton.fadeIn();
                    });
                    saveButton.click(function(evt) {
                        ui.saveFieldGroups(fieldGroup, fieldElements);
                        saveButton.hide();
                        editButton.fadeIn();
                    });
                }
                fieldElements[fieldGroup.fieldId] = $('<div class="stellar-fieldgroup"></div>').appendTo(header) 
                fieldGroup.fields.forEach(function(field) {
                    field.fieldId = "f"+i++;
                    fieldElements[field.fieldId] = $('<div class="stellar-field '+field.attrib+'"></div>').appendTo(box)
                });
            });
        },

        editFieldGroups: function(fieldGroup, fieldElements) {
            fieldGroup.fields.forEach(function(field) {
                var dataset = fieldElements[field.fieldId].children(".sl_datainfo");
                var theid   = dataset.attr("id");
                var newid   = theid+"-form";
                var currval = dataset.text();

                dataset.empty();

                var attr = {
                    id: newid,
                    value: currval || ""
                };

                var el = ui.createFieldType(field, attr);
                $(el).appendTo(dataset);
        
            });
        },

        saveFieldGroups: function (fieldGroup, fieldElements ) {
            var data = {};

            fieldGroup.fields.forEach(function(field) {

                var dataset = fieldElements[field.fieldId].children(".sl_datainfo");
                var newid   = dataset.attr("id");
                var cinput  = "#"+newid+"-form";
                var einput  = $(cinput);
                var newval  = einput.val();
                var fieldname;

                if (einput.attr('type') === 'checkbox') {
                    newval = einput.is(':checked') ? 'yes' : 'no';
                }

                einput.remove();
                dataset.html(newval);

                fieldname = newid.replace(/^sl_/, '');

                data[fieldname] = newval;
            });

            api.updateMemberProfile(data);
        },

        updateFieldGroups: function (fieldLabels, fieldElements) {
            //log("updateFieldGroups", fieldLabels, fieldElements);
            fieldLabels.forEach(function(fieldGroup) {
                ui.updateFieldValue(fieldElements, fieldGroup.fieldId, fieldGroup);
                fieldGroup.fields.forEach(function(field) {
                    ui.updateFieldValue(fieldElements, field.fieldId, field);
                });
            });
        },

        updateFieldValue: function (fieldElements, fieldId, field) {
            var value = ui.getFieldValue(field);
            value = ui.formatField(field, value);
            value = '<span id="sl_'+field.attrib+'" class="sl_datainfo">'+value+'</span>';
            //log("field", fieldId, "=", value);
            fieldElements[fieldId].html(field.label.replace('{{value}}', value));
        },

        createFieldType: function(field, attr) {
            var el;
            var type = field.type;
            var attribute = {
                type: type,
                id: attr.id,
                name: attr.id 
            };

            switch (type) {
            case 'checkbox':
                el = $('<input />', attribute);
                if (attr.value == 'yes') { 
                    el.attr('checked', 'checked');
                }
                break;
            case 'textarea':
                el = $('<textarea>', attribute);
                el.text(value);
                break;
            case 'text':
                el = $('<input />', attribute);
                el.attr('value', attr.value);
                break;
            }
            return el;
        }

    };

    // public
    Stellar.ui = {};
    Stellar.ui.refresh = ui.refresh;

    /**
   *  Stellar API Client
   *  private
   */
    api = {

        init: function(client) {
            if (!client.url || !client.id || !client.id.length) {
                throw "Stellar API Error - invalid client settings, please consult the SDK documentation";
            }
            api.client = client;
        },

        client: {},

        callOauthToken: function (grant_type, callback) {
            callback = callback || emptyFn;
            var fn = 'callOauthToken';
            //log(fn, grant_type);
            var opts = {
                type: 'POST',
                data: {
                    grant_type: grant_type,
                    client_id: api.client.id[0]
                },
                success: function (response) {
                    log(fn, "SUCCESS response", response);
                    member.access_token = response.access_token;
                    member.refresh_token = response.refresh_token;
                    state.save();
                    callback(response);
                },
                error: function (response) {
                    ui.loginNotification('.stellar-login-notification',response);
                    // log(fn, "ERROR response", response);
                    // log(fn, "clearing access tokens");
                    member.access_token = null;
                    member.refresh_token = null;
                    //state.save();
                    callback(response);
                }
            };

            $('.stellar-login-notification').html('');
            // Note: the client secret is only allowed for sandbox environments.
            // Production environments must implement a tunnel.
            if (api.client.id.length === 2) {
                opts.data['client_secret'] = api.client.id[1];
            }
            if (grant_type === "password") {
                opts.data.email = member.identity.email;
                opts.data.password = member.identity.password;
            }

            if (grant_type === "assertion") {
                opts.data.provider = member.provider;
                opts.data.assertion = member.assertion;
            }

            else if (grant_type === "refresh_token") {
                opts.data.access_token = member.access_token;
                opts.data.refresh_token = member.refresh_token;
            }
            api.request('/oauth/token', opts, callback);
        },

        callRegisterMember: function(opts,callback) {
            callback = callback || emptyFn;
            var fn = 'callRegisterMember';

            var opts = {
                type: 'POST',
                data: opts,
                success: function (response) {
                    console.log('---succc--')
                    log(fn, "SUCCESS response", response);
                    // member.access_token = response.access_token;
                    // member.refresh_token = response.refresh_token;
                    // state.save();
                    callback(response);
                },
                error: function (response) {
                    ui.loginNotification('.stellar-signup-notification',response);
                    // log(fn, "ERROR response", response);
                    // log(fn, "clearing access tokens");
                    member.access_token = null;
                    member.refresh_token = null;
                    //state.save();
                    callback(response);
                }
            };

            $('.stellar-signup-notification').html('');
            if (api.client.id.length === 2) {
                opts.data['client_id'] = api.client.id[0];
                opts.data['client_secret'] = api.client.id[1];
            }

            api.request('/api/sign_up', opts, callback);
        },

        callMemberSummary: function (callback) {
            var fn = 'callMemberSummary';
            if (!member.access_token) {
                log(fn, "SKIP - requires an access token");
                callback();
                return;
            }
            callback = callback || emptyFn;
            var opts = {
                data: { access_token: member.access_token },
                success: function (response) {
                    log(fn, "SUCCESS response", response);
                    member.summary = response.data;
                    state.buildMemberName();
                    state.save();
                    callback(response);
                }
            };
            api.request('/api/summary.json', opts, callback);
        },

        callMemberProfile: function (callback) {
            var fn = 'callMemberProfile';
            if (!member.access_token) {
                log(fn, "SKIP - requires an access token");
                callback();
                return;
            }
            callback = callback || emptyFn;
            var opts = {
                data: { access_token: member.access_token },
                success: function (response) {
                    log(fn, "SUCCESS response", response);
                    member.profile = response.data;
                    state.save();
                    callback(response);
                }
            };
            api.request('/api/profile.json', opts, callback);
        },

        updateMemberProfile: function (data, callback) {
            var fn = 'updateMemberProfile';
            if (!member.access_token) {
                log(fn, "SKIP - requires an access token");
                callback();
                return;
            }
            callback = callback || emptyFn;
            var opts = {
                type: 'PUT',
                data: data,
                success: function (response) {
                    log(fn, "SUCCESS response", response);
                    // member.profile = response.data;
                    // state.save();
                    // callback(response);
                }
            };

            opts.data.access_token = member.access_token;

            api.request('/api/profile', opts, callback);
        },

        callActivities: function (callback) {
            var fn = 'callActivities';
            if (!member.access_token) {
                log(fn, "SKIP - requires an access token");
                callback();
                return;
            }
            callback = callback || emptyFn;
            var opts = {
                data: { access_token: member.access_token },
                success: function (response) {
                    log(fn, "SUCCESS response", response);
                    member.activities = response.data.activities;
                    state.save();
                    callback(response);
                }
            };
            api.request('/api/activities.json', opts, callback);
        },

        callOffers: function (offerConfig, callback) {
            var fn = 'callOffers';
            if (!member.access_token) {
                log(fn, "SKIP - requires an access token");
                callback();
                return;
            }
            callback = callback || emptyFn;
            offerConfig = offerConfig || {};
            offerConfig.layout = offerConfig.layout || "medium_rectangle";
            var opts = {
                data: {
                    access_token: member.access_token,
                    layout: offerConfig.layout,
                    html: true 
                },
                success: function (response) {
                    log(fn, "SUCCESS response", offerConfig.layout, offerConfig.id, response);
                    if (!member.offers) {
                        member.offers = {};
                    }
                    if (offerConfig.id) {
                        log("saving single offer");
                        member.offers[response.data.id] = response.data;
                    }
                    else {
                        log("saving multiple offers");
                        var offers = response.data.offers;
                        if (offers.length) {
                            member.offers[offerConfig.layout] = offers;
                        }
                    }
                    log("loaded offers", member.offers);
                    callback(response);
                }
            };
            if (offerConfig.id) {
                api.request('/api/offers/'+offerConfig.id+'.json', opts, callback);
            }
            else {
                api.request('/api/offers.json', opts, callback);
            }
        },
        callChallenges: function (challengeConfig, callback) {
            var fn = 'callChallenges';
            if (!member.access_token) {
                log(fn, "SKIP - requires an access token");
                callback();
                return;
            }
            callback = callback || emptyFn;
            challengeConfig = challengeConfig || {};
            challengeConfig.layout = challengeConfig.layout || "medium_rectangle";
            var opts = {
                data: {
                    access_token: member.access_token,
                    layout: challengeConfig.layout,
                    html: true 
                },
                success: function (response) {
                    log(fn, "SUCCESS response", challengeConfig.layout, challengeConfig.id, response);
                    if (!member.challenges) {
                        member.challenges = {};
                    }
                    if (challengeConfig.id) {
                        log("saving single challenge");
                        member.challenges[response.data.id] = response.data;
                    }
                    else {
                        log("saving multiple challenges");
                        var challenges = response.data.challenges;
                        if (challenges.length) {
                            member.challenges[challengeConfig.layout] = challenges;
                        }
                    }
                    log("loaded challenges", member.challenges);
                    callback(response);
                }
                error: {

                }
            };
            if (challengeConfig.id) {
                api.request('/api/challenges/'+challengeConfig.id+'.json', opts, callback);
            }
            else {
                api.request('/api/challenges.json', opts, callback);
            }
        },

        callRewards: function(rewardConfig, callback) {
            var fn = 'callRewards';
            if (!member.access_token) {
                log(fn, "SKIP - requires an access token");
                callback();
                return;
            }
            callback = callback || emptyFn;
            rewardConfig = rewardConfig || {};
            rewardConfig.layout = rewardConfig.layout || "medium_rectangle";
            var opts = {
                data: {
                    access_token: member.access_token,
                    layout: rewardConfig.layout,
                    html: true 
                },
                success: function (response) {
                    log(fn, "SUCCESS response", rewardConfig.layout, rewardConfig.id, response);
                    if (!member.rewards) {
                        member.rewards = {};
                    }
                    if (rewardConfig.id) {
                        log("saving single rewards");
                        member.rewards[response.data.id] = response.data;
                    }
                    else {
                        log("saving multiple rewards");
                        var offers = response.data.rewards;
                        if (offers.length) {
                            member.rewards[rewardConfig.layout] = offers;
                        }
                    }
                    log("loaded rewards", member.rewards);
                    callback(response);
                }
            };
            if (rewardConfig.id) {
                api.request( '/api/rewards/' + rewardConfig.id+'.json', opts, callback);
            }
            else {
                api.request( '/api/rewards.json' , opts, callback);
            }
        },

        callContentBlock: function(contentBlockConfig, callback) {
            var fn = 'callContentBlock';
            if (!member.access_token) {
                log(fn, "SKIP - requires an access token");
                callback();
                return;
            }
            callback = callback || emptyFn;
            contentBlockConfig = contentBlockConfig || {};
            contentBlockConfig.layout = contentBlockConfig.layout || "medium_rectangle";
            var opts = {
                data: {
                    access_token: member.access_token,
                    layout: contentBlockConfig.layout,
                    html: true 
                },
                success: function (response) {
                    log(fn, "SUCCESS response", contentBlockConfig.layout, contentBlockConfig.id, response);
                    if (!member.contentBlock) {
                        member.contentBlock = {};
                    }
                    if (contentBlockConfig.id) {
                        log("saving single content block");
                        member.contentBlock[response.data.id] = response.data;
                    }
                    else {
                        log("saving multiple content block");
                        var offers = response.data.content_blocks;
                        if (offers.length) {
                            member.contentBlock[contentBlockConfig.layout] = offers;
                        }
                    }
                    log("loaded content block", member.contentBlock);
                    callback(response);
                }
            };
            if (contentBlockConfig.id) {
                api.request( '/api/content_blocks/' + contentBlockConfig.id+'.json', opts, callback);
            }
            else {
                api.request( '/api/content_blocks' , opts, callback);
            }
        },

        callContentPage: function(contentPageConfig, callback) {
            var fn = 'callContentPage';
            if (!member.access_token) {
                log(fn, "SKIP - requires an access token");
                callback();
                return;
            }
            callback = callback || emptyFn;
            contentPageConfig = contentPageConfig || {};
            contentPageConfig.layout = contentPageConfig.layout || "medium_rectangle";

            var opts = {
                data: {
                    access_token: member.access_token,
                    layout: contentPageConfig.layout,
                    html: true 
                },
                success: function (response) {
                    log(fn, "SUCCESS response", response);
                    if (!member.contentPage) {
                        member.contentPage = {};
                    }

                    member.contentPage[contentPageConfig.layout] = response.data.content_pages;

                    // if (contentPageConfig.id) {
                    //   log("saving single content block");
                    //   member.contentBlock[response.data.id] = response.data;
                    // }
                    // else {
                    //   log("saving multiple content block");
                    //   var pages = response.data.content_pages;
                    //   if (pages.length) {
                    //     member.contentBlock[contentPageConfig.layout] = pages;
                    //   }
                    // }
                    // log("loaded content block", member.contentBlock);
                    callback(response);
                }
            };
            // if (contentPageConfig.id) {
            //   api.request( '/api/content_pages/' + contentPageConfig.id+'.json', opts, callback);
            // }
            // else {
            api.request( '/api/content_pages' , opts, callback);
            // }
        },

        callRespondChallenge: function(config, callback) {
            var fn = 'callRespondChallenge';

            if (!member.access_token) {
                log(fn, "SKIP - requires an access token");
                callback();
                return;
            }
            callback = callback || emptyFn;
            config = config || {};

            config.formData.append('access_token', member.access_token);

            var opts = {
                type: 'POST',
                data: config.formData,
                processData: false,
                contentType: false,
                success: function (response) {
                    log(fn, "SUCCESS response", response);
                    callback(response);
                },
                error: function (response) {
                    console.log(fn, "ERROR response", response);
                    callback(response);
                }
            };

            api.request('/api/challenges/'+config.id+'/respond', opts, callback);
        },

        callRedeemRewards: function(config, callback) {
            var fn = 'callRedeemRewards';

            if (!member.access_token) {
                log(fn, "SKIP - requires an access token");
                callback();
                return;
            }
            callback = callback || emptyFn;
            config = config || {};

            config.formData.append('access_token', member.access_token);

            var opts = {
                type: 'POST',
                data: config.formData,
                processData: false,
                contentType: false,
                success: function (response) {
                    log(fn, "SUCCESS response", response);
                    callback(response);
                },
                error: function (response) {
                    console.log(fn, "ERROR response", response);
                    callback(response);
                }
            };

            api.request('/api/rewards/'+config.id+'/redeem', opts, callback);
        },

        // Request wrapper used for all API calls
        request: function (endpoint, opts, retryCallback) {
            var fn = "request";
            retryCallback = retryCallback || emptyFn;
            var successCallback = opts.success || api.defaultSuccessHandler; 
            var errorCallback = opts.error || api.defaultErrorHandler;
            // var url = opts.url + endpoint || api.client.url + endpoint;
            opts.url = api.client.url + endpoint;
            opts.data = opts.data || {};
            opts.beforeSend = function(xhr){ xhr.setRequestHeader('Accept', 'application/vnd.stellar-v1+json') };
            // callbacks
            opts.success = successCallback;
      
            opts.error = function (response, status, error) {
                api.getErrorCode(response);
                log(fn, "ERROR", endpoint, "errorCode:", response.errorCode, "response:", response);
                errorCallback(response);
            };
            // CORS
            // note that the server must also set Access-Control-Allow-Origin to allow calls from this domain
            opts.crossDomain = true;
            // send it
            log('CALL', endpoint, opts);
            jQuery.ajax(opts);
        },

        getErrorCode: function (response) {
            // generate a consistent error code
            response.errorCode = "unknown_error";
            if (response.status === 0) {
                response.errorCode = "cannot_load";
            }
            else if (response.responseJSON && response.responseJSON.error) {
                response.errorCode = response.responseJSON.error;
            }
            else if (response.responseJSON && response.responseJSON.name) {
                response.errorCode = response.responseJSON.name;
            }
            else {
                response.errorCode = response.responseText;
            }
            log("Error Code:", response.errorCode, response.status, response);
            return response.errorCode;
        },

        defaultSuccessHandler: function (response) {
            log(endpoint, "SUCCESS", response);
            log("you should define your own success callback!");
        },

        defaultErrorHandler: function (response) {
            var fn = "defaultErrorHandler";
            // refresh auth token
            if (response.errorCode === "expired_token") {
                log(fn, "refreshing auth token");
                api.refreshAuthToken(function () {
                    ui.refresh();
                    // api.request(endpoint, afterRefreshOpts, afterRefreshSuccess);
                });
            }
            else if (response.errorCode === "cannot_load") {
                log(fn, "cannot load");
            }
            else if (response.errorCode === "invalid_request") {
                log(fn, "invalid request");
            }
        },

        refreshAuthTokenLimit: 3,
        refreshAuthToken: function (afterRefreshSuccess) {
            var fn = "refreshAuthToken";
            //log(fn, api.refreshAuthTokenLimit);
            api.refreshAuthTokenLimit--;
            if (api.refreshAuthTokenLimit < 1) {
                log(fn, "SKIP retries exceeded");
                return;
            }
            if (!member.access_token || !member.refresh_token) {
                log(fn, "SKIP requires auth tokens");
                return;
            }

            api.callOauthToken("refresh_token", function (response) {
                log(fn, "after call", response.errorCode, response);
                if (response.errorCode) {
                    log(fn, "ERROR", response.errorCode);
                    // what now? notify user?
                }
                else {
                    log(fn, "SUCCESS", response);
                    afterRefreshSuccess();
                }
            });
        },

        end: true
    };

    // Public
    Stellar.callMemberSummary = api.callMemberSummary;
    Stellar.callMemberProfile = api.callMemberProfile;

    /**
   *  Utils
   *  private
   */
    util = {

        loadScript: function(d, s, src, id, callback) {
            var el, sjs = d.getElementsByTagName(s)[0];
            if (d.getElementById(id)) {return;}
            el = d.createElement('script'); 

            if (el.readyState) { //IE
                el.onreadystatechange = function() {
                    if (el.readyState == "loaded" || el.readyState == "complete") {
                        el.onreadystatechange = null;
                        callback();
                    }
                };
            } else { //Other
                el.onload = function () {
                    callback();
                };
            }

            el.id = id;
            el.src = src;
            sjs.parentNode.insertBefore(el, sjs);
        },

        loadStylesheet: function(d, s, href, id) {
            var el, sjs = d.getElementsByTagName("head")[0];
            if (d.getElementById(id)) {return;}
            el = d.createElement(s); el.id = id;
            el.setAttribute('rel', 'stylesheet');
            el.setAttribute('href', href);
            sjs.parentNode.insertBefore(el, sjs);
        },

        setCookie: function (name, value) {
            var secure = location.protocol === "https:";
            var cookie = name+'='+value;
            cookie += "; path=/";
            if (secure) cookie += "; secure;";
            cookie += ";";
            document.cookie = cookie;
            // jquery cookie plugin might be convenient
            //$.cookie(name, value, { secure: secure });
            var check = util.getCookie(name);
            if (check === value) {
                //log('setCookie check passed for', cookie);
            }
            else {
                log('setCookie check failed for', cookie);
            }
        },

        getCookie: function (name) {
            var value = "; " + document.cookie;
            var parts = value.split("; " + name + "=");
            if (parts.length) return parts.pop().split(";").shift();
            return "";
        },

        clearCookie: function (name) {
            document.cookie = name+"=;";
            document.cookie = name+"=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;";
        },

        arrayChoice: function (ary, filter) {
            if (filter) ary = ary.filter(filter);
            return ary[ Math.floor(Math.random() * ary.length) ];
        }

    };

    /**
   *  Member - member data
   *  private
   */
    member = {};
    member.identity = {};

    // demo data
    member.demo = {};
    member.demo.activities = [
        { sl_type: "Attended town hall", detail: "2 hours", "sl_metrics.point": 20},
        { sl_type: "Victory training", detail: "", "sl_metrics.point": 10},
        { sl_type: "Redemption", detail: "socks", "sl_metrics.point": "-50"},
        { sl_type: "Envelope stuffing", detail: "3 hours", "sl_metrics.point": 30},
        { sl_type: "Poll watch", detail: "6 hours", "sl_metrics.point": 60},
        { sl_type: "Envelope stuffing", detail: "3 hours", "sl_metrics.point": 30}
    ];
    member.demo.badges = [
        { name: "Gift of Gab", detail: "calls 12 hours", color: "#D4AF37", icon: "phone"},
        { name: "Road Builder", detail: "attends parade", color: "#D4AF37", icon: "road"},
        { name: "Walker Ranger", detail: "walks 6 hours", color: "#c4c7ce", icon: "street-view"},
        { name: "Postman", detail: "Stuffs envelopes", color: "#49371b", icon: "envelope"},
        { name: "Funder", detail: "donates $320", color: "#49371b", icon: "bank"}
    ];
    member.demo.offers = [
        { html: "" }
    ];
    member.demo.points = {
        current: 300,
        next: 600
    };

    Stellar.demo = function (key, value) {
        member.demo[key] = value;
    };

    /**
   *  State management
   *  private
   *  TODO -- set on page, not in sdk
   */
    state = {

        buildMemberName: function () {
            if (member.summary && member.summary.member) {
                var summary = member.summary.member;
                //log("member summary", summary);
                var first_name = summary.first_name || "";
                var last_name = summary.last_name || "";
                member.identity.full_name = (first_name + " " + last_name).trim() || member.identity.email;
                member.identity.short_name = first_name.trim() || member.identity.email;
                member.isKnown = true;
                //log("built member name", member);
            }
        },

        load: function () {
            member.identity.short_name = util.getCookie("short_name") || member.identity.short_name;
            member.identity.full_name = util.getCookie("full_name") || member.identity.full_name;
            member.identity.email = util.getCookie("email") || member.identity.email;
            member.access_token = util.getCookie("access_token");
            member.refresh_token = util.getCookie("refresh_token");
            member.isKnown = member.identity.short_name ? true : false;
            log('LOAD member', member);
        },

        save: function () {
            //log("saving", member);
            if (member.identity.short_name) {
                util.setCookie("short_name", member.identity.short_name);
                util.setCookie("full_name", member.identity.full_name);
                util.setCookie("email", member.identity.email);
            }
            util.setCookie("access_token", member.access_token);
            util.setCookie("refresh_token", member.refresh_token);
            //log("document.cookie", document.cookie);
        },

        clear: function () {
            member.isKnown = false;
            member.access_token = null;
            member.refresh_token = null;
            util.clearCookie("short_name");
            util.clearCookie("full_name");
            util.clearCookie("email");
            util.clearCookie("access_token");
            util.clearCookie("refresh_token");
            //log("cleared state", document.cookie);
        }
    };


    // Utils

    function emptyFn (){};

    function log () {
        if (this.console && this.console.log) {
            console.log.apply(console, arguments);
        }
    }

    // TODO - write callback guard
    function guard () {
    }


    // debugging / dev
    Stellar.dev = { member: member, state: state, widgets: widgets, labels: labels };

    // Publish public API
    window.Stellar = Stellar;
    return Stellar;
}).call({}, window.inDapIF ? parent.window : window);


/**
 *  Async init
 */
(function () { 
    if (window.stellarAsyncInit && !window.stellarAsyncInit.hasRun) {
    //log("stellarAsyncInit()");
        window.stellarAsyncInit.hasRun = true;
        window.stellarAsyncInit();
    };
}());


