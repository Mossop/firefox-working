/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

const { IdentityService } = ChromeUtils.importESModule(
  "resource:///modules/IdentityService.sys.mjs"
);

const lazy = {};
XPCOMUtils.defineLazyGetter(lazy, "gSubDialog", function() {
  const { SubDialogManager } = ChromeUtils.import(
    "resource://gre/modules/SubDialog.jsm"
  );

  return new SubDialogManager({
    dialogStack: document.getElementById("dialogStack"),
    dialogTemplate: document.getElementById("dialogTemplate"),
  });
});

class Identity extends HTMLElement {
  #identity = null;

  constructor(identity) {
    super();
    this.#identity = identity;
    this.classList.add("card");

    let template = document.getElementById("template-identity");
    let fragment = template.content.cloneNode(true);

    let nameEl = fragment.querySelector(".identity-name");
    nameEl.textContent = identity.name;

    let iconEl = fragment.querySelector(".identity-icon");
    iconEl.style.backgroundImage = `url("${identity.iconURL}")`;
    iconEl.style.color = identity.color;

    if (identity.isCurrent) {
      fragment.querySelector(".action-launch").setAttribute("disabled", "true");
      this.classList.add("current");
    } else {
      fragment
        .querySelector(".action-launch")
        .addEventListener("click", () => this.#launch());
    }

    if (identity.isRoot || identity.isCurrent) {
      fragment.querySelector(".action-delete").setAttribute("disabled", "true");
    } else {
      fragment
        .querySelector(".action-delete")
        .addEventListener("click", () => this.#delete());
    }

    fragment
      .querySelector(".action-edit")
      .addEventListener("click", () => this.edit());

    this.appendChild(fragment);
  }

  #launch() {
    this.#identity.launch();
  }

  edit() {
    lazy.gSubDialog.open(
      "chrome://browser/content/identities/edit.xhtml",
      {
        closedCallback: async () => {
          let identity = new Identity(
            await IdentityService.get(this.#identity.id)
          );
          this.replaceWith(identity);
        },
      },
      { identityId: this.#identity.id }
    );
  }

  async #delete() {
    await this.#identity.delete();
    this.remove();
  }
}

customElements.define("e-identity", Identity);

async function create() {
  let list = document.querySelector("#identity-list");
  let identity = new Identity(await IdentityService.create("New Identity"));
  list.appendChild(identity);
  identity.edit();
}

async function init() {
  document.querySelector("#action-create").addEventListener("click", create);
  await rebuild();
}

async function rebuild() {
  let identities = await IdentityService.list();
  let list = document.querySelector("#identity-list");

  list.replaceChildren(...identities.map(identity => new Identity(identity)));
}

init().catch(console.error);
