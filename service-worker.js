let webSocket = null;
let reconnectIntervalId = null;
let keepAliveIntervalId = null;
let enabled = false;

chrome.runtime.onStartup.addListener(function () {
    console.log('open');
    chrome.storage.local.get("enabled", (data) => {
        enabled = data.enabled || false;
        if (enabled) {
            startReconnectionLoop();
        }
    });
})

chrome.action.setIcon({path: 'icons/socket-disabled.png'});
chrome.action.onClicked.addListener(async () => {
    enabled = !enabled;
    chrome.storage.local.set({enabled});

    if (enabled) {
        startReconnectionLoop();
    } else {
        stopReconnectionLoop();
    }
});

function connect() {
    if (webSocket && (webSocket.readyState === WebSocket.OPEN || webSocket.readyState === WebSocket.CONNECTING)) {
        console.log("WebSocket is already connected or connecting. Skipping connect.");
        return;
    }

    //console.log('Connecting to WebSocket server...');
    webSocket = new WebSocket('ws://localhost:8000/integration/chrome'); //todo: dynamic

    webSocket.onopen = () => {
        chrome.action.setIcon({path: 'icons/socket-active.png'});
        console.log('WebSocket connection established.');
        clearReconnectInterval();
        startKeepAlive();
    };

    webSocket.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        //console.log("Event type: ", data.type);
        if (data.type === 'execute_javascript') {
            let tabId = null;
            const selector = data.metadata.selector;
            if (selector) {
                if (selector.host) {
                    const tabs = await getTabsByHost(selector.host);
                    if (tabs.length > 0) {
                        if (tabs.length > 1) {
                            console.log('Found multiple tabs by host', tabs);

                            const activeTab = await getActiveTab();
                            if (activeTab) {
                                const url = new URL(activeTab.url);
                                if (url.host === selector.host) {
                                    console.log("Using active tab");
                                    tabId = activeTab.id;
                                } else {
                                    console.log("Defaulting to first tab by host");
                                    tabId = tabs[0].id;
                                }
                            } else {
                                console.log("Defaulting to first tab by host");
                                tabId = tabs[0].id;}
                        } else {
                            tabId = tabs[0].id;
                        }
                    } else {
                        console.error('No tabs found by host:', selector.host);
                        const resp = {
                            'result': {
                                'status': 'error',
                                'message': 'No tabs found by host: ' + selector.host,
                                'info': 'Tell the user to open a tab'
                            },
                            'replyTo': data.replyTo
                        }
                        webSocket.send(JSON.stringify(resp));
                        return;
                    }
                } else {
                    console.error('Invalid selector:', selector);
                    const resp = {
                        'result': {
                            'status': 'error',
                            'message': 'Invalid selector: ' + selector,
                            'info': 'Tell the user to check the selector'
                        },
                        'replyTo': data.replyTo
                    }
                    webSocket.send(JSON.stringify(resp));
                    return;
                }
            } else {
                const activeTab = await getActiveTab();
                if (!activeTab) {
                    console.log('No active tab found');
                    const resp = {
                        'result': {
                            'status': 'error',
                            'message': 'No active tab found',
                            'info': 'Tell the user to open a tab'
                        },
                        'replyTo': data.replyTo
                    }
                    webSocket.send(JSON.stringify(resp));
                    return;
                }
                tabId = activeTab.id;
            }

            chrome.tabs.sendMessage(tabId, {type: "evaluate", code: data.payload}, (response) => {
                if (chrome.runtime.lastError) {
                    console.error("Error:", chrome.runtime.lastError);
                } else {
                    //console.log("Received response from content script:", response.result);
                    const replyTo = data.replyTo;
                    //console.log('replyTo', replyTo);
                    const resp = {
                        result: response.result,
                        replyTo: replyTo
                    };
                    webSocket.send(JSON.stringify(resp));
                }
            });
        } else {
            console.error('Unknown event type:', data.type);
        }
    };

    webSocket.onclose = () => {
        //console.log('WebSocket connection closed');
        webSocket = null;
        clearKeepAlive();

        if (enabled) {
            chrome.action.setIcon({path: 'icons/socket-inactive.png'});
            if (!reconnectIntervalId) {
                startReconnectionLoop();
            }
        }
    };
}

async function getActiveTab() {
    const tabs = await chrome.tabs.query({active: true, currentWindow: true});
    return tabs[0];
}

async function getTabsByHost(host) {
    const tabs = await chrome.tabs.query({});
    return tabs.filter(tab => {
        const url = new URL(tab.url);
        return url.host === host;
    });
}

function disconnect() {
    console.log('Disconnecting from WebSocket server...');
    if (webSocket) {
        webSocket.close();
        webSocket = null;
    }
}

function startKeepAlive() {
    console.log('Starting keep alive interval...');
    clearKeepAlive();
    keepAliveIntervalId = setInterval(() => {
        if (webSocket && webSocket.readyState === WebSocket.OPEN) {
            webSocket.send(JSON.stringify({type: 'ping'}));
        } else {
            clearKeepAlive();
        }
    }, 20 * 1000);
}

function clearKeepAlive() {
    //console.log('Clearing keep alive interval...');
    if (keepAliveIntervalId) {
        clearInterval(keepAliveIntervalId);
        keepAliveIntervalId = null;
    }
}

function startReconnectionLoop() {
    console.log('Starting reconnection loop...');
    chrome.action.setIcon({path: 'icons/socket-inactive.png'});

    connect();
    reconnectIntervalId = setInterval(() => {
        //console.log('Attempting to reconnect...');
        connect();
    }, 5000);
}

function stopReconnectionLoop() {
    console.log('Stopping reconnection loop...');
    chrome.action.setIcon({path: 'icons/socket-disabled.png'});
    clearInterval(reconnectIntervalId);
    reconnectIntervalId = null;
    disconnect();
}

function clearReconnectInterval() {
    console.log('Clearing reconnect interval...');
    if (reconnectIntervalId) {
        clearInterval(reconnectIntervalId);
        reconnectIntervalId = null;
    }
}
