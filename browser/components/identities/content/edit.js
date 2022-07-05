/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { IdentityService } = ChromeUtils.importESModule(
  "resource:///modules/IdentityService.sys.mjs"
);

const ICONS = [
  "avatar",
  "fingerprint",
  "briefcase",
  "dollar",
  "cart",
  "vacation",
  "gift",
  "food",
  "fruit",
  "pet",
  "tree",
  "chill",
  "circle",
  "fence",
];

const COLORS = [
  "#000000",
  "#37adff",
  "#00c79a",
  "#51cd00",
  "#ffcb00",
  "#ff9f00",
  "#ff613d",
  "#ff4bda",
  "#af51f5",
];

const EditDialog = {
  async onLoad() {
    let params = window.arguments[0];
    this._dialog = document.querySelector("dialog");
    this.identity = await IdentityService.get(params.identityId);

    const iconWrapper = document.getElementById("iconWrapper");
    iconWrapper.appendChild(this.createIconButtons());

    const colorWrapper = document.getElementById("colorWrapper");
    let swatches = this.createColorSwatches();
    colorWrapper.appendChild(swatches);
    swatches.addEventListener("command", () => this.updateIconColors());

    let name = document.getElementById("name");
    name.value = this.identity.name;

    document.addEventListener("dialogaccept", () => this.onApplyChanges());

    // This is to prevent layout jank caused by the svgs and outlines rendering at different times
    document.getElementById("containers-content").removeAttribute("hidden");

    this.updateIconColors();
  },

  createIconButtons() {
    let currentIcon = this.identity.icon ?? "avatar";

    let radiogroup = document.createXULElement("radiogroup");
    radiogroup.setAttribute("id", "icon");
    radiogroup.className = "icon-buttons radio-buttons";

    for (let icon of ICONS) {
      let iconSwatch = document.createXULElement("radio");
      iconSwatch.id = "iconbutton-" + icon;
      iconSwatch.name = "icon";
      iconSwatch.type = "radio";
      iconSwatch.value = icon;

      if (currentIcon == icon) {
        iconSwatch.setAttribute("selected", true);
      }

      document.l10n.setAttributes(iconSwatch, `containers-icon-${icon}`);
      let iconElement = document.createXULElement("hbox");
      iconElement.className = "userContext-icon";
      iconElement.classList.add("identity-icon-" + icon);

      iconSwatch.appendChild(iconElement);
      radiogroup.appendChild(iconSwatch);
    }

    return radiogroup;
  },

  createColorSwatches() {
    let currentColor = this.identity.color ?? "#000000";

    let radiogroup = document.createXULElement("radiogroup");
    radiogroup.setAttribute("id", "color");
    radiogroup.className = "radio-buttons";

    for (let color of COLORS) {
      let colorSwatch = document.createXULElement("radio");
      colorSwatch.name = "color";
      colorSwatch.type = "radio";
      colorSwatch.value = color;

      if (currentColor == color) {
        colorSwatch.setAttribute("selected", true);
      }

      let iconElement = document.createXULElement("hbox");
      iconElement.className = "userContext-icon";
      iconElement.classList.add("identity-icon-circle");
      iconElement.style.color = color;

      colorSwatch.appendChild(iconElement);
      radiogroup.appendChild(colorSwatch);
    }

    return radiogroup;
  },

  updateIconColors() {
    let color = document.getElementById("color").value;
    document.getElementById("icon").style.color = color;
  },

  onApplyChanges() {
    let icon = document.getElementById("icon").value;
    let color = document.getElementById("color").value;
    let name = document.getElementById("name").value;

    this.identity.name = name;
    this.identity.color = color;
    this.identity.icon = icon;
    this.identity.store();
  },
};
