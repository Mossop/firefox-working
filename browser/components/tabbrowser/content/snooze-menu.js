/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// This is loaded into chrome windows with the subscript loader. Wrap in
// a block to prevent accidentally leaking globals onto `window`.
{
  const { TabState } = ChromeUtils.importESModule(
    "resource:///modules/sessionstore/TabState.sys.mjs"
  );

  const { TabStateFlusher } = ChromeUtils.importESModule(
    "resource:///modules/sessionstore/TabStateFlusher.sys.mjs"
  );

  const MIDNIGHT = {
    hour: 0,
    minute: 0,
    second: 0,
    millisecond: 0,
    microsecond: 0,
    nanosecond: 0,
  };

  function today() {
    return Temporal.Now.plainDateTimeISO().with(MIDNIGHT);
  }

  function tomorrow() {
    return Temporal.Now.plainDateTimeISO()
      .add(new Temporal.Duration(0, 0, 0, 1))
      .with(MIDNIGHT);
  }

  function morning(pdt) {
    return pdt.with({
      ...MIDNIGHT,
      hour: 9,
    });
  }

  function afternoon(pdt) {
    return pdt.with({
      ...MIDNIGHT,
      hour: 17,
    });
  }

  class MozTabbrowserSnoozeMenu extends MozXULElement {
    #panel = null;
    #cancelButton = null;
    #snoozeButton = null;
    #dateTime = null;
    #tabs = null;

    static markup = /*html*/ `
      <panel
        type="arrow"
        class="snooze-panel"
        orient="vertical"
        role="dialog"
        ignorekeys="true"
        norolluponanchor="true">

        <html:div class="panel-header" >
          <html:h1>Snooze Tabs</html:h1>
        </html:div>

        <toolbarseparator />

        <html:div class="panel-body" >
          <html:moz-button-group>
            <html:moz-button
              id="snooze-tdy-afternoon"
              label="This afternoon">
            </html:moz-button>
            <html:moz-button
              id="snooze-tmrw-morning"
              label="Tomorrow morning">
            </html:moz-button>
            <html:moz-button
              id="snooze-tmrw-afternoon"
              label="Tomorrow afternoon">
            </html:moz-button>
          </html:moz-button-group>
        </html:div>

        <html:input id="snooze-datetime" type="datetime-local" />

        <toolbarseparator />

        <html:moz-button-group>
          <html:moz-button id="snooze-cancel" label="Cancel">
          </html:moz-button>
          <html:moz-button
            id="snooze-snooze"
            type="primary"
            label="Snooze">
          </html:moz-button>
        </html:moz-button-group>

      </panel>
    `;

    constructor() {
      super();
    }

    connectedCallback() {
      this.appendChild(this.constructor.fragment);
      this.initializeAttributeInheritance();

      this.#panel = this.querySelector("panel");
      this.#cancelButton = this.querySelector("#snooze-cancel");
      this.#snoozeButton = this.querySelector("#snooze-snooze");
      this.#dateTime = this.querySelector("#snooze-datetime");

      this.querySelector("#snooze-tdy-afternoon").addEventListener(
        "click",
        () => {
          this.update(afternoon(today()));
        }
      );

      this.querySelector("#snooze-tmrw-morning").addEventListener(
        "click",
        () => {
          this.update(morning(tomorrow()));
        }
      );

      this.querySelector("#snooze-tmrw-afternoon").addEventListener(
        "click",
        () => {
          this.update(afternoon(tomorrow()));
        }
      );

      this.#cancelButton.addEventListener("click", () => {
        this.close();
      });
      this.#snoozeButton.addEventListener("click", async () => {
        await Promise.all(
          this.#tabs.map(tab => TabStateFlusher.flush(tab.linkedBrowser))
        );

        let tabStates = this.#tabs.map(tab => TabState.collect(tab));
        gBrowser.removeTabs(this.#tabs, { skipSessionStore: true });

        setTimeout(() => {
          let isFirst = true;

          for (let tabState of tabStates) {
            let newTab = gBrowser.addTrustedTab(null, {
              skipLoad: true,
            });

            SessionStore.setTabState(newTab, tabState);

            if (isFirst) {
              isFirst = false;
              gBrowser.selectedTab = newTab;
            }
          }
        }, 7000);

        this.close();
      });
    }

    get #panelPosition() {
      if (gBrowser.tabContainer.verticalMode) {
        return SidebarController._positionStart
          ? "topleft topright"
          : "topright topleft";
      }
      return "bottomleft topleft";
    }

    update(temporal) {
      this.#dateTime.value = temporal.toString();
    }

    openModal(tabs) {
      this.#tabs = tabs;

      this.#dateTime.setAttribute("min", Temporal.Now.plainDateTimeISO());
      this.update(afternoon(today()));

      this.#panel.openPopup(tabs[0], {
        position: this.#panelPosition,
      });
    }

    close() {
      this.#panel.hidePopup();
    }
  }

  customElements.define("snooze-menu", MozTabbrowserSnoozeMenu);
}
