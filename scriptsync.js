var t;
var realTimeUpdating = false;
var msgCnt = 0;
var msgShown = false;
var scriptTabCreated = false;
var ws;

$(document).ready(function () {
    t = $('#synclog').DataTable({
        columnDefs: [{
            render: $.fn.dataTable.render.moment('X', 'HH:mm:ss'),
            targets: 0
        },
        {
            width: 50,
            targets: [0, 1]
        }
        ],
        "bLengthChange": false,
        "bSortClasses": false,
        "scrollY": "100%",
        "scrollCollapse": true,
        "paging": false,
        "order": [
            [0, "desc"]
        ]
    });
    $('#addRow').on('click', function () {
        t.row.add([
            new Date(), 'click', '', '', '', ''
        ]).draw(false);
    });


    function connect() {

        ws = new WebSocket("ws://127.0.0.1:1978");


        ws.onerror = function (evt) {

            if (msgShown) {
                return;
            }
            msgShown = true;

            t.row.add([
                new Date(), 'WebSocket', '<b>Could not connect to WebSocket.</b><br />Check if VS Code is running and wait for connection or reload the page.<br />' +
                '<a target="_blank" href="https://marketplace.visualstudio.com/items?itemName=arnoudkooicom.sn-scriptsync">Get sn-scriptsync from Visual Code Marketplace</a>'
            ]).draw(false);
            increaseTitlecounter();
            flashFavicon('images/iconred48.png', 3);
            //setTimeout(function () { location.reload(true); }, 30000);
        };

        ws.onclose = function (evt) {
            if (msgCnt > 0) {
                t.row.add([
                    new Date(), 'WebSocket', '<b>Connection to WebSocket lost, check if sn-scriptsync runs and wait for connection or reload page.</b>'
                ]).draw(false);
                increaseTitlecounter();
                flashFavicon('images/iconred48.png', 3);
                msgCnt = 0;
            }

            setTimeout(function () {
                connect();
            }, 1000);
        };

        ws.onmessage = function (evt) {
            msgCnt++;
            var wsObj = JSON.parse(evt.data);
            if (wsObj.hasOwnProperty('liveupdate')) {
                updateRealtimeBrowser(wsObj);
            }
            if (wsObj.hasOwnProperty('mirrorbgscript')) {
                mirrorBgScript(wsObj);
            }
            else if (wsObj.hasOwnProperty('refreshedtoken')) {
                refreshedToken(wsObj);
                flashFavicon('images/icongreen48.png', 4);
                increaseTitlecounter();
            }
            else {
                realTimeUpdating = false;
                if ('contentLength' in wsObj) {
                    t.row.add([
                        new Date(), 'ServiceNow', 'Opened in VS Code: <b>' + wsObj.name + '</b><br /><span class="code">Instance: ' +
                        wsObj.instance.name + ' | Field: ' + wsObj.table + '.' + wsObj.field +
                        ' | Characters: ' + wsObj.contentLength + '</code>'
                    ]).draw(false);
                    flashFavicon('images/icongreen48.png', 4);
                    increaseTitlecounter();
                } else if (wsObj.action == 'requestRecord') {
                    requestRecord(wsObj);
                } else if (wsObj.action == 'requestRecords') {
                    requestRecords(wsObj);
                } else if (wsObj.action == 'requestAppMeta') {
                    requestAppMeta(wsObj);
                } else if (wsObj.action == 'linkAppToVSCode') {
                    // no need to log more..
                } else if ('instance' in wsObj) {
                    updateRecord(wsObj, true);
                } else {
                    t.row.add([
                        new Date(), 'WebSocket', JSON.parse(evt.data)                        
                    ]).draw(false);
                    increaseTitlecounter();
                    if (evt.data.indexOf('error') > 0) {
                        flashFavicon('images/iconred48.png', 3);
                        ws.send(wsObj);
                    }
                    else{
                        flashFavicon('/images/icon32.png', 1);
                    }
                }
            }
        };

        window.onbeforeunload = function () {
            ws.onclose = function () { };
            ws.close();
            return "Are you sure you want to navigate away?";
        };
    }
    connect();

});

function requestRecord(requestJson) {
    var client = new XMLHttpRequest();
    client.open("get", requestJson.instance.url + '/api/now/table/' +
        requestJson.tableName + '/' + requestJson.sys_id);

    client.setRequestHeader('Accept', 'application/json');
    client.setRequestHeader('Content-Type', 'application/json');
    client.setRequestHeader('X-UserToken', requestJson.instance.g_ck);

    client.onreadystatechange = function () {
        if (this.readyState == this.DONE) {
            var resp = JSON.parse(this.response);

            if (resp.hasOwnProperty('result')) {
                if (requestJson.hasOwnProperty('actionGoal')) {
                    if (requestJson.actionGoal != 'updateCheck') {
                        t.row.add([
                            new Date(), 'VS Code', 'Received from ServiceNow: <b>' + requestJson.name + '</b><br /><span class="code">Instance: ' +
                            requestJson.instance.name + ' | Table: ' + requestJson.tableName + '</span>'

                        ]).draw(false);
                    }
                }
                increaseTitlecounter();
                requestJson.type = "requestRecord";
                requestJson.result = resp.result;
                ws.send(JSON.stringify(requestJson));

            } else {
                t.row.add([
                    new Date(), 'VS Code', this.response
                ]).draw(false);
                increaseTitlecounter();
                ws.send(JSON.stringify(this.response));
            }
        }
    };
    client.send();
}

function requestToken(scriptObj) {
    t.row.add([
        new Date(), 'WebSocket', 'Trying to acquire new token from instance'
    ]).draw(false);

    var client = new XMLHttpRequest();
    client.open("get", scriptObj.instance.url + '/sn_devstudio_/v1/get_publish_info.do');
    client.setRequestHeader('Accept', 'application/json');
    client.setRequestHeader('Content-Type', 'application/json');
    client.setRequestHeader("Authorization" , "BasicCustom");
    
    client.onreadystatechange = function () {
        if (this.readyState == this.DONE) {
            var resp = JSON.parse(this.response);
            if (resp.hasOwnProperty('ck')) {
                scriptObj.instance.g_ck = resp.ck;

                var data = {
                    "action" : "writeInstanceSettings",
                    "instance" : scriptObj.instance
                }
                increaseTitlecounter();
                ws.send(JSON.stringify(data));

                t.row.add([
                    new Date(), 'WebSocket', 'New token acquired from: ' + scriptObj.instance.name
                ]).draw(false);
                updateRecord(scriptObj,false)
            }
            else{
                t.row.add([
                    new Date(), 'WebSocket', 'Error: ' + JSON.stringify(this.response)
                ]).draw(false);
            }
        }
    };
    client.send();
}



function requestRecords(requestJson) {
    var client = new XMLHttpRequest();
    client.open("get", requestJson.instance.url + '/api/now/table/' +
        requestJson.tableName + '?' + requestJson.queryString);

    client.setRequestHeader('Accept', 'application/json');
    client.setRequestHeader('Content-Type', 'application/json');
    client.setRequestHeader('X-UserToken', requestJson.instance.g_ck);

    client.onreadystatechange = function () {
        if (this.readyState == this.DONE) {
            var resp = JSON.parse(this.response);

            if (resp.hasOwnProperty('result')) {
                t.row.add([
                    new Date(), 'VS Code', 'Received from ServiceNow: <b>' + resp.result.length + ' records</b><br /><span class="code">Instance: ' +
                    requestJson.instance.name + ' | Table: ' + requestJson.tableName + '</span>'

                ]).draw(false);
                increaseTitlecounter();
                requestJson.type = "requestRecords";
                requestJson.results = resp.result;
                ws.send(JSON.stringify(requestJson));

            } else {
                t.row.add([
                    new Date(), 'VS Code', this.response
                ]).draw(false);
                increaseTitlecounter();
                ws.send(JSON.stringify(resp));
            }
        }
    };
    client.send();
}

function requestAppMeta(requestJson) {
    var client = new XMLHttpRequest();
    client.open("get", requestJson.instance.url + '/_sn/sn_devstudio_/v1/ds?sysparm_transaction_scope=' + requestJson.appId);

    client.setRequestHeader('Accept', 'application/json');
    client.setRequestHeader('Content-Type', 'application/json');
    client.setRequestHeader('X-UserToken', requestJson.instance.g_ck);

    client.onreadystatechange = function () {
        if (this.readyState == this.DONE) {
            var resp = JSON.parse(this.response);

            if (resp.hasOwnProperty('artifacts')) {

                t.row.add([
                    new Date(), 'VS Code', 'Received Scope artifacts from app: <b>' + requestJson.appName + '</b><br /><span class="code">Instance: ' +
                    requestJson.instance.name + ' | scope: ' + requestJson.appScope + '</span>'

                ]).draw(false);

                increaseTitlecounter();
                requestJson.type = "requestRecord";
                requestJson.result = resp;
                ws.send(JSON.stringify(requestJson));

            } else {
                t.row.add([
                    new Date(), 'VS Code', this.response
                ]).draw(false);
                increaseTitlecounter();
                ws.send(JSON.stringify(this.response));
            }
        }
    };
    client.send();
}




function updateRealtimeBrowser(scriptObj) {
    if (!realTimeUpdating) {
        t.row.add([
            new Date(), 'VS Code', 'Realtime updating widget CSS'
        ]).draw(false);
        realTimeUpdating = true;
    }

    if (scriptObj.hasOwnProperty('testUrls')) {

        for (var i = 0; i < scriptObj.testUrls.length; i++) {
            chrome.tabs.query({
                url: scriptObj.testUrls[i]
            }, function (arrayOfTabs) {
                if (arrayOfTabs.length)
                    chrome.tabs.executeScript(arrayOfTabs[0].id, { "code": "document.getElementById('v" + scriptObj.sys_id + "-s').innerHTML = `" +  DOMPurify.sanitize(scriptObj.css) + "`" });
            });
        }
    }

}

function mirrorBgScript(scriptObj) {
    if (!realTimeUpdating) {
        t.row.add([
            new Date(), 'VS Code', 'Realtime updating Background Script'
        ]).draw(false);
        realTimeUpdating = true;
    }


    chrome.tabs.query({ //in iframe
        url: scriptObj.instance.url + "/*sys.scripts.do"
    }, function (arrayOfTabs) {
        if (arrayOfTabs.length){
            scriptTabCreated = false;
            var prefix = arrayOfTabs[0].url.includes("nav_to.do?uri=%2Fsys.scripts.do") ? "gsft_main." : "";
            chrome.tabs.executeScript(arrayOfTabs[0].id, { "code": prefix + "document.getElementById('runscript').value = `" + scriptObj.content + "`" });
        }
        else if (!scriptTabCreated){
            var createObj = {
                'url': scriptObj.instance.url + "/sys.scripts.do",
                'active': true
            }
            chrome.tabs.create(createObj,
                function(tab) {
                    chrome.tabs.executeScript(tab.id, { "code": "document.getElementById('runscript').value = `" + scriptObj.content + "`" });
                }
            );

            t.row.add([
                new Date(), 'VS Code', 'Opening new Background Script tab'
            ]).draw(false);

            scriptTabCreated = true;
        }
    });

    // chrome.tabs.query({ //not in iframe
    //     url: scriptObj.instance.url + "sys.scripts.do"
    // }, function (arrayOfTabs) {
    //     if (arrayOfTabs.length){
    //         chrome.tabs.executeScript(arrayOfTabs[0].id, { "code": "document.getElementById('runscript').value = `" + scriptObj.content + "`" });
    //     }
    // });

}

function refreshedToken(instanceObj){
    t.row.add([
        new Date(), 'VS Code',  instanceObj.response
    ]).draw(false);
}

function refreshToken(instanceObj) {

    t.row.add([
        new Date(), 'WebSocket', "Invalid token, trying to get new g_ck token from instance: " + instanceObj.name
    ]).draw(false);
    

    chrome.tabs.query({
        url: instanceObj.url + "/*"
    }, function (arrayOfTabs) {
        if (arrayOfTabs.length) {
            chrome.tabs.executeScript(arrayOfTabs[0].id, { "code": "document.getElementById('sn_gck').value" }, 
            function (g_ck){ 
                console.log(g_ck) 
            });
        }
        else{
            t.row.add([
                new Date(), 'WebSocket', "Request g_ck failed, please open a new session " + instanceObj.name
            ]).draw(false);           
        }
    });
}



function updateRecord(scriptObj, canRefreshToken) {
    var client = new XMLHttpRequest();
    client.open("put", scriptObj.instance.url + '/api/now/table/' +
        scriptObj.tableName + '/' + scriptObj.sys_id +
        '?sysparm_fields=sys_id');
    var data = {};
    data[scriptObj.fieldName] = scriptObj.content;

    client.setRequestHeader('Accept', 'application/json');
    client.setRequestHeader('Content-Type', 'application/json');
    client.setRequestHeader('X-UserToken', scriptObj.instance.g_ck);

    client.onreadystatechange = function () {
        if (this.readyState == this.DONE) {
            var resp = JSON.parse(this.response);

            if (resp.hasOwnProperty('result')) {
                t.row.add([
                    new Date(), 'VS Code', 'Saved to ServiceNow: <b>' + scriptObj.name + '</b><br /><span class="code">Instance: ' +
                    scriptObj.instance.name + 
                    ' | Field: ' + scriptObj.tableName + '.' + scriptObj.fieldName + 
                    ' | Save source: ' + (scriptObj.saveSource || "unknown") + 
                    ' | Characters: ' + scriptObj.content.length + '</span>'

                ]).draw(false);
                flashFavicon('images/icongreen48.png', 4);
                increaseTitlecounter();

                if (scriptObj.hasOwnProperty('testUrls')) {
                    for (var i = 0; i < scriptObj.testUrls.length; i++) {
                        chrome.tabs.query({
                            url: scriptObj.testUrls[i]
                        }, function (arrayOfTabs) {
                            if (arrayOfTabs.length)
                                chrome.tabs.reload(arrayOfTabs[0].id);
                        });
                    }
                }


            } else {

                var resp = JSON.parse(this.response);

                if (resp.hasOwnProperty('error')){
                    if (resp.error.hasOwnProperty('message')){
                        // if (resp.error.message == "User Not Authenticated"){
                        //     if (canRefreshToken){
                        //         requestToken(scriptObj);
                        //         return;
                        //     }
                        // }
                    }
                }

                t.row.add([
                    new Date(), 'VS Code', this.response
                ]).draw(false);
                flashFavicon('images/iconred48.png', 3);
                increaseTitlecounter();
                ws.send(this.response);

            }
        }
    };
    client.send(JSON.stringify(data));
}

var favIconIsFlashing = false;

function flashFavicon(src, flashes) {

    setIntervalX(function () {
        currentsource = favIconIsFlashing ? '/images/icon32.png' : src;
        changeFavicon(currentsource);
        favIconIsFlashing = !favIconIsFlashing;
    }, 900, flashes);

}

function setIntervalX(callback, delay, repetitions) {
    var x = 0;
    var intervalID = window.setInterval(function () {

        callback();

        if (++x === repetitions) {
            window.clearInterval(intervalID);
            favIconIsFlashing = false;
        }
    }, delay);
}
var eventCount = 0;

function increaseTitlecounter() {
    document.title = "[" + (++eventCount) + "] Scriptsync SN Utils by arnoudkooi.com";
}

function changeFavicon(src) {
    var link = document.createElement('link'),
        oldLink = document.getElementById('dynamic-favicon');
    link.id = 'dynamic-favicon';
    link.rel = 'shortcut icon';
    link.href = src;
    if (oldLink) {
        document.head.removeChild(oldLink);
    }
    document.head.appendChild(link);
}