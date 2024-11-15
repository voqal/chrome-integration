const body = document.getElementsByTagName('body')[0];
const iframe = document.createElement('iframe');
iframe.src = chrome.runtime.getURL('sandbox.html');
iframe.style.display = 'none';
iframe.style.position = 'absolute';
iframe.style.width = '0';
iframe.style.height = '0';
iframe.style.border = '0';
body.appendChild(iframe);

const handlers = new Map();

window.addEventListener("message", (event) => {
    if (event.source === iframe.contentWindow && event.data.voqal_resp_id) {
        console.log("Received message from iframe", event.data);
        const handler = handlers.get(event.data.voqal_resp_id);
        if (handler) {
            handler(event.data.result);
            handlers.delete(event.data.voqal_resp_id);
        } else {
            console.warn(`No handler found for message ID: ${event.data.voqal_resp_id}`);
        }
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "evaluate") {
        const handler = (data) => {
            function getElementByXPath(xpath) {
                const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                return result.singleNodeValue;
            }

            function triggerComplexClick(element) {
                if (!element) {
                    console.error("Element not found.");
                    return;
                }
                if (element.tabIndex >= 0) {
                    element.focus();
                    console.log("Element focused.");
                }
                const mouseDownEvent = new MouseEvent("mousedown", {bubbles: true, cancelable: true, view: window});
                element.dispatchEvent(mouseDownEvent);
                console.log("Mousedown event dispatched.");
                const mouseUpEvent = new MouseEvent("mouseup", {bubbles: true, cancelable: true, view: window});
                element.dispatchEvent(mouseUpEvent);
                console.log("Mouseup event dispatched.");
                const clickEvent = new MouseEvent("click", {bubbles: true, cancelable: true, view: window});
                element.dispatchEvent(clickEvent);
                console.log("Click event dispatched.");
                if (!element.onclick && element.tabIndex >= 0) {
                    const keyEvent = new KeyboardEvent("keydown", {
                        bubbles: true,
                        cancelable: true,
                        key: "Enter",
                        code: "Enter"
                    });
                    element.dispatchEvent(keyEvent);
                    console.log("Enter key event dispatched.");
                }
            }

            function clickAndReevaluate(iframe, message) {
                console.log("doing click");
                const element = getElementByXPath(data.xpath);
                if (element) {
                    triggerComplexClick(element);
                } else {
                    console.error('Element not found');
                }
                setTimeout(() => {
                    console.log("Reevaluating");
                    iframe.contentWindow.postMessage({
                        html: document.body.innerHTML,
                        code: message.code,
                        action: 'reevaluate',
                        voqal_resp_id: message.voqal_resp_id
                    }, "*");
                }, 1000);
            }

            function writeText(iframe, message) {
                console.log("writing text");
                const element = getElementByXPath(data.xpath);
                if (element) {
                    element.innerText = data.text;
                } else {
                    console.error('Element not found');
                }
            }

            function click(iframe, message) {
                let toClick = [];
                if (data.xpath) {
                    toClick = [getElementByXPath(data.xpath)];
                } else if (data.xpaths) {
                    toClick = data.xpaths.map(getElementByXPath);
                } else {
                    console.error('No xpath(s) provided');
                }
                toClick.forEach(element => {
                    if (element) {
                        console.log("clicking", element);
                        triggerComplexClick(element);
                    } else {
                        console.error('Element not found');
                    }
                });
            }

            if (data.action === 'click') {
                click(iframe, message);
                sendResponse({result: data});
            } else if (data.action === 'click_and_reevaluate') {
                clickAndReevaluate(iframe, message);
            } else if (data.action === 'write_text') {
                writeText(iframe, message);
                sendResponse({result: data});
            } else {
                sendResponse({result: data});
            }
        };

        handlers.set(message.voqal_resp_id, handler);
        iframe.contentWindow.postMessage({
            html: document.body.innerHTML,
            code: message.code,
            voqal_resp_id: message.voqal_resp_id
        }, "*");

        return true;
    }
});
