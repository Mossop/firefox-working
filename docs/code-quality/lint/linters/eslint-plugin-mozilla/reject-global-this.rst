reject-global-this
======================

Rejects global ``this`` usage in JSM files.  The global ``this`` is not
available in ESM, and this is a preparation for the migration.

Examples of incorrect code for this rule:
-----------------------------------------

.. code-block:: js

    this.EXPORTED_SYMBOLS = ["foo"];

    XPCOMUtils.defineLazyModuleGetters(this, {
      AddonManager: "moz-src:///toolkit/mozapps/extensions/AddonManager.jsm",
    });


Examples of correct code for this rule:
---------------------------------------

.. code-block:: js

    const EXPORTED_SYMBOLS = ["foo"];

    const lazy = {};
    XPCOMUtils.defineLazyModuleGetters(lazy, {
      AddonManager: "moz-src:///toolkit/mozapps/extensions/AddonManager.jsm",
    });
