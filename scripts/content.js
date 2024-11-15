const body = document.getElementsByTagName('body')[0];
const iframe = document.createElement('iframe');
iframe.src = chrome.runtime.getURL('sandbox.html');
iframe.style.display = 'none';
iframe.style.position = 'absolute';
iframe.style.width = '0';
iframe.style.height = '0';
iframe.style.border = '0';
body.appendChild(iframe);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "evaluate") {
        //console.log("EVAL input", message.code);
        iframe.contentWindow.postMessage({html: document.body.innerHTML, code: message.code}, "*");

        const voqalMessageHandler = (event) => {
            if (event.source === iframe.contentWindow) {
                function getElementByXPath(xpath) {
                    const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                    return result.singleNodeValue;
                }

                function triggerComplexClick(element) {
                    // Ensure the element exists
                    if (!element) {
                        console.error("Element not found.");
                        return;
                    }

                    // Step 1: Focus the element if it can receive focus
                    if (element.tabIndex >= 0) {
                        element.focus();
                        console.log("Element focused.");
                    }

                    // Step 2: Trigger `mousedown` and `mouseup` events for elements that need full simulation
                    const mouseDownEvent = new MouseEvent("mousedown", {
                        bubbles: true,
                        cancelable: true,
                        view: window,
                    });
                    element.dispatchEvent(mouseDownEvent);
                    console.log("Mousedown event dispatched.");

                    const mouseUpEvent = new MouseEvent("mouseup", {
                        bubbles: true,
                        cancelable: true,
                        view: window,
                    });
                    element.dispatchEvent(mouseUpEvent);
                    console.log("Mouseup event dispatched.");

                    // Step 3: Trigger the click event
                    const clickEvent = new MouseEvent("click", {
                        bubbles: true,
                        cancelable: true,
                        view: window,
                    });
                    element.dispatchEvent(clickEvent);
                    console.log("Click event dispatched.");

                    // Step 4: Trigger a key event if the element is focusable but didn’t respond to clicks
                    // Use `Enter` key, which commonly activates buttons and links
                    if (!element.onclick && element.tabIndex >= 0) {
                        const keyEvent = new KeyboardEvent("keydown", {
                            bubbles: true,
                            cancelable: true,
                            key: "Enter",
                            code: "Enter",
                        });
                        element.dispatchEvent(keyEvent);
                        console.log("Enter key event dispatched.");
                    }
                }

                function clickAndReevaluate(iframe, message, event) {
                    console.log("doing click");

                    const element = getElementByXPath(event.data.xpath);
                    if (element) {
                        // element.click();
                        triggerComplexClick(element);
                    } else {
                        console.error('Element not found');
                    }

                    // Wait for the click to finish, then reevaluate
                    setTimeout(() => {
                        console.log("Reevaluating");
                        iframe.contentWindow.postMessage({
                            html: document.body.innerHTML,
                            code: message.code,
                            action: 'reevaluate'
                        }, "*");
                    }, 1000);
                }

                function writeText(iframe, message, event) {
                    console.log("writing text");
                    const element = getElementByXPath(event.data.xpath);
                    if (element) {
                        element.innerText = event.data.text;
                    } else {
                        console.error('Element not found');
                    }
                }

                function click(iframe, message, event) {
                    let toClick = [];
                    if (event.data.xpath) {
                        toClick = [getElementByXPath(event.data.xpath)];
                    } else if (event.data.xpaths) {
                        toClick = event.data.xpaths.map(getElementByXPath);
                    } else {
                        console.error('No xpath(s) provided');
                    }
                    toClick.forEach(element => {
                        if (element) {
                            console.log("clicking", element);
                            //element.click();
                            triggerComplexClick(element);
                        } else {
                            console.error('Element not found');
                        }
                    });
                }

                if (event.data.action === 'click') {
                    click(iframe, message, event);

                    sendResponse({result: event.data});
                    window.removeEventListener("message", voqalMessageHandler);
                } else if (event.data.action === 'click_and_reevaluate') {
                    clickAndReevaluate(iframe, message, event);
                } else if (event.data.action === 'write_text') {
                    writeText(iframe, message, event);

                    sendResponse({result: event.data});
                    window.removeEventListener("message", voqalMessageHandler);
                } else {
                    sendResponse({result: event.data});
                    window.removeEventListener("message", voqalMessageHandler);
                }
            }
        };

        window.addEventListener("message", voqalMessageHandler);
        return true;
    }
});
