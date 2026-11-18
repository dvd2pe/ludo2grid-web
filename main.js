var Crazyuser = null;
var Crazyusertoken = null;
var crazyEntryPointData = null;
var crazyBannerWidth = 320;
(function() {

    'use strict';

    function parseJwt(token) {
        var base64Url = token.split('.')[1];
        var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        var jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));

        return JSON.parse(jsonPayload);
    }

    function boot() {
        var RESOURCES = cc.AssetManager.BuiltinBundleName.RESOURCES;
        var INTERNAL = cc.AssetManager.BuiltinBundleName.INTERNAL;
        var MAIN = cc.AssetManager.BuiltinBundleName.MAIN;

        var settings = window._CCSettings;
        window._CCSettings = undefined;

        function GetDesignResolution() {
            if (cc.sys.isMobile) {
                return (cc.sys.isIpad || cc.sys.ipadRes) ? {
                    width: 768,
                    height: 1024
                } : {
                    width: 640,
                    height: 960
                };
            }
            return {
                width: 640,
                height: 960
            };
        }
        // init engine
        var canvas;

        if (cc.sys.isBrowser) {
            canvas = document.getElementById('GameCanvas');
        }

        function setLoadingDisplay() {
            // Loading splash scene
            cc.loader.onProgress = function(completedCount, totalCount, item) {
                var progress = 100 * completedCount / totalCount;
                if (false == true) FBInstant.setLoadingProgress(progress);
            };
        }
        var onStart = function() {
            cc.view.resizeWithBrowserSize(true);
            cc.view.enableRetina(true);

            if (cc.sys.isBrowser) {
                setLoadingDisplay();
            }

            if (cc.sys.isMobile) {
                if (settings.orientation === 'landscape') {
                    cc.view.setOrientation(cc.macro.ORIENTATION_LANDSCAPE);
                } else if (settings.orientation === 'portrait') {
                    cc.view.setOrientation(cc.macro.ORIENTATION_PORTRAIT);
                }
                // qq, wechat, baidu
                cc.view.enableAutoFullScreen(
                    cc.sys.browserType !== cc.sys.BROWSER_TYPE_BAIDU &&
                    cc.sys.browserType !== cc.sys.BROWSER_TYPE_WECHAT &&
                    cc.sys.browserType !== cc.sys.BROWSER_TYPE_MOBILE_QQ
                );
            }


            var res = GetDesignResolution();
            cc.view.setDesignResolutionSize(res.width, res.height, cc.ResolutionPolicy.FIXED_WIDTH);

            if (false == true) sendOpenStats(FBInstant.player.getID(), "loading_start");

            // Limit downloading max concurrent task to 2,
            // more tasks simultaneously may cause performance draw back on some android system / brwosers.
            // You can adjust the number based on your own test result, you have to set it before any loading process to take effect.
            if (cc.sys.isBrowser && cc.sys.os === cc.sys.OS_ANDROID) {
                cc.assetManager.downloader.maxConcurrency = 2;
            }

            var jsList = settings.jsList;
            var bundledScript = settings.debug ? 'src/project.dev.js' : 'src/project.js';
            if (jsList) {
                jsList = jsList.map(function(x) {
                    return 'src/' + x;
                });
                jsList.push(bundledScript);
            } else {
                jsList = [bundledScript];
            }
            // anysdk scripts
            if (cc.sys.isNative && cc.sys.isMobile) {
                jsList = jsList.concat(['src/anysdk/jsb_anysdk.js', 'src/anysdk/jsb_anysdk_constants.js']);
            }
            var jsList = settings.jsList;
            var bundledScript = settings.debug ? 'src/project.dev.js' : 'src/project.js';
            if (jsList) {
                jsList = jsList.map(function(x) {
                    return 'src/' + x;
                });
                jsList.push(bundledScript);
            } else {
                jsList = [bundledScript];
            }
            // anysdk scripts
            if (cc.sys.isNative && cc.sys.isMobile) {
                jsList = jsList.concat(['src/anysdk/jsb_anysdk.js', 'src/anysdk/jsb_anysdk_constants.js']);
            }

            var ua = window.navigator.userAgent + "";
            var isAsus = false;
            if (ua.indexOf("ASUS_") > -1) {
                isAsus = true;
            }
            if (!cc.sys.capabilities["opengl"] || isAsus) {
                var rawAssets = settings.rawAssets;
                var assets = rawAssets["assets"];
                for (var i in assets) {
                    if (assets[i].length > 1) {
                        var keyWord = "SpriteSheets/";
                        var resFolderName = "SpriteSheets4444";
                        if (assets[i][0].indexOf(keyWord) > -1) {
                            var spriteSheetLocation = assets[i][0];
                            var spriteSheetName = spriteSheetLocation.substring(keyWord.length, spriteSheetLocation.length);
                            assets[i][0] = resFolderName + '/' + spriteSheetName;
                        }
                    }
                }
                rawAssets["assets"] = assets;
                settings.rawAssets = rawAssets;
            }
            var launchScene = settings.launchScene;

            var bundle = cc.assetManager.bundles.find(function(b) {
                return b.getSceneInfo(launchScene);
            });

            bundle.loadScene(launchScene,
                cc.sys.isBrowser ? function(completedCount, totalCount) {
                    var progress = 100 * completedCount / totalCount;
                    if (false == true) {
                        FBInstant.setLoadingProgress(progress);
                    }
                    //we can set the condition for other platforms here
                } : null,
                function(err, scene) {
                    if (false == true) {
                        FBInstant.startGameAsync()
                            .then(function() {
                                console.log('Success to load scene: ' + launchScene);
                                cc.director.runSceneImmediate(scene);
                            })
                            .catch(function(e) {
                                cc.error(e);
                            });
                    } else if (true == true) {
                        window.CrazyGames.SDK.game.sdkGameLoadingStart();
                        cc.director.runSceneImmediate(scene);
                    }
                }
            );

        };

        // jsList
        var jsList = settings.jsList;
        var bundledScript = settings.debug ? 'src/project.dev.js' : 'src/project.min.js';
        if (jsList) {
            jsList = jsList.map(function(x) {
                return 'src/' + x;
            });
            jsList.push(bundledScript);
        } else {
            jsList = [bundledScript];
        }

        // anysdk scripts
        if (cc.sys.isNative && cc.sys.isMobile) {
            jsList = jsList.concat(['src/anysdk/jsb_anysdk.js', 'src/anysdk/jsb_anysdk_constants.js']);
        }

        var ua = window.navigator.userAgent + "";
        var rendererMode = 0;
        if (ua.indexOf("ASUS_") > -1) {
            rendererMode = 1;
        }

        var option = {
            //width: width,
            //height: height,
            id: 'GameCanvas',
            debugMode: settings.debug ? cc.debug.DebugMode.INFO : cc.debug.DebugMode.ERROR,
            showFPS: settings.debug,
            frameRate: 60,
            groupList: settings.groupList,
            collisionMatrix: settings.collisionMatrix,
            renderMode: rendererMode
        };

        cc.assetManager.init({
            bundleVers: settings.bundleVers
        });
        var bundleRoot = [INTERNAL];
        settings.hasResourcesBundle && bundleRoot.push(RESOURCES);

        var count = 0;

        function cb(err) {
            if (err) return console.error(err.message, err.stack);
            count++;
            if (count === bundleRoot.length + 1) {
                cc.assetManager.loadBundle(MAIN, function(err) {
                    if (!err) cc.game.run(option, onStart);
                });
            }
        }

        // load plugins
        cc.assetManager.loadScript(settings.jsList.map(function(x) {
            return 'src/' + x;
        }), cb);

        // load bundles
        for (var i = 0; i < bundleRoot.length; i++) {
            cc.assetManager.loadBundle(bundleRoot[i], cb);
        }
    }

    var RavenLimiter = {};
    var run_time_environment = "production"; // will be replaced with production on release branch
    var sendExceptions = (run_time_environment == "production") ? (Math.random() < 0.5 ? true : false) : true;
    if (window.document) {

        Raven.config((sendExceptions ? 'https://47066c3720a542d888263b18dec885d3@sentry.io/1226070' : false), {
            release: '1403',
            environment: run_time_environment,
            shouldSendCallback: function(data) {
                if (data.message in RavenLimiter && RavenLimiter[data.message] > 100) {
                    return false;
                }
                if (!RavenLimiter[data.message]) {
                    RavenLimiter[data.message] = 0;
                }
                RavenLimiter[data.message]++;
                return true;
            }
        });

        Raven.debug = sendExceptions;
        Raven.install();

        Raven.context(function() {
            var debug = window._CCSettings.debug;

            function loadScript(moduleName, cb) {
                function scriptLoaded() {
                    document.body.removeChild(domScript);
                    domScript.removeEventListener('load', scriptLoaded, false);
                    cb && cb();
                };
                var domScript = document.createElement('script');
                domScript.async = true;
                domScript.src = moduleName;
                domScript.addEventListener('load', scriptLoaded, false);
                document.body.appendChild(domScript);
            }

            loadScript(debug ? 'cocos2d-js.js' : 'cocos2d-js-min.js', function() {
                if (CC_PHYSICS_BUILTIN || CC_PHYSICS_CANNON) {
                    loadScript(debug ? 'physics.js' : 'physics-min.js', function() {
                        if (false == true) {
                            FBInstant.initializeAsync().then(function() {
                                sendOpenStats(FBInstant.player.getID(), "initializeAsyncDone")
                                if (typeof VConsole !== 'undefined') {
                                    window.vConsole = new VConsole();
                                }
                                FBInstant.setLoadingProgress(1);
                                boot();
                            });
                        } else if (true == true) {
                            function userToken(err, token) {
                                if (err) {
                                    console.error("getUserToken err", err);
                                }
                                console.log("getUserToken token", token);
                                if (token && !err) {
                                    Crazyusertoken = parseJwt(token);
                                }
                                boot()
                            }

                            function sdkInitialized(err, user) {
                                console.error("getUser err", err);
                                console.log("getUser user", user);
                                if (user && !err) {
                                    Crazyuser = user;
                                }
                                console.log("banner width:" + document.getElementById('banner-container').offsetWidth);
                                crazyBannerWidth = document.getElementById('banner-container').offsetWidth;
                                // window.CrazyGames.SDK.banner.requestBanner({
                                //     id: "banner-container",
                                //     width: 320,
                                //     height: 50,
                                // });
                                window.CrazyGames.SDK.user.getUserToken(userToken);
                                // boot()
                            }
                            const callback = (error, isAvailable) => {
                                if (error) {
                                    console.error("Error:", error);
                                    boot()
                                } else {
                                    if (!isAvailable) {
                                        boot()
                                        return
                                    }
                                    window.CrazyGames.SDK.user.getUser(sdkInitialized);
                                    console.log("User account available", isAvailable);
                                }
                            };
                            window.CrazyGames.SDK.user.isUserAccountAvailable(callback);
                        }
                        //can add the flags here according to required target platform.              
                    });
                } else {
                    if (false == true) {
                        FBInstant.initializeAsync().then(function() {
                            sendOpenStats(FBInstant.player.getID(), "initializeAsyncDone")
                            if (typeof VConsole !== 'undefined') {
                                window.vConsole = new VConsole();
                            }
                            FBInstant.setLoadingProgress(1);
                            boot();
                        });
                    } else if (true == true) {
                        function userToken(err, token) {
                            if (err) {
                                console.error("getUserToken err", err);
                            }
                            console.log("getUserToken token", token);
                            if (token && !err) {
                                Crazyusertoken = parseJwt(token);
                            }
                            boot()
                        }

                        function sdkInitialized(err, user) {
                            console.error("getUser err", err);
                            console.log("getUser user", user);
                            var search = location.search.substring(1);
                            if (search) crazyEntryPointData = JSON.parse('{"' + search.replace(/&/g, '","').replace(/=/g, '":"') + '"}', function(key, value) {
                                return key === "" ? value : decodeURIComponent(value)
                            })
                            if (user && !err) {
                                Crazyuser = user;
                            }
                            console.log("banner width:" + document.getElementById('banner-container').offsetWidth);
                            crazyBannerWidth = document.getElementById('banner-container').offsetWidth;
                            // window.CrazyGames.SDK.banner.requestBanner({
                            //     id: "banner-container",
                            //     width: 320,
                            //     height: 50,
                            // });
                            window.CrazyGames.SDK.user.getUserToken(userToken);
                            // boot()
                        }
                        const callback = (error, isAvailable) => {
                            if (error) {
                                console.error("Error:", error);
                                boot()
                            } else {
                                if (!isAvailable) {
                                    boot()
                                    return
                                }
                                window.CrazyGames.SDK.user.getUser(sdkInitialized);
                                console.log("User account available", isAvailable);
                            }
                        };
                        window.CrazyGames.SDK.user.isUserAccountAvailable(callback);
                    } else {
                        var search = location.search.substring(1);
                        if (search) crazyEntryPointData = JSON.parse('{"' + search.replace(/&/g, '","').replace(/=/g, '":"') + '"}', function(key, value) {
                            return key === "" ? value : decodeURIComponent(value)
                        })
                    }
                }
            });
        });
    }

})();