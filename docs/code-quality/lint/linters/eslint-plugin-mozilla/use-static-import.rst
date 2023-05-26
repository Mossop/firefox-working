use-static-import
=================

Requires the use of static imports in system ES module files (``.sys.mjs``)
where possible.

Examples of incorrect code for this rule:
-----------------------------------------

.. code-block:: js

    const { XPCOMUtils } = ChromeUtils.importESModule("moz-src:///js/xpconnect/loader/XPCOMUtils.sys.mjs");
    const { XPCOMUtils: foo } = ChromeUtils.importESModule("moz-src:///js/xpconnect/loader/XPCOMUtils.sys.mjs");

Examples of correct code for this rule:
---------------------------------------

.. code-block:: js

    import { XPCOMUtils } from "moz-src:///js/xpconnect/loader/XPCOMUtils.sys.mjs";
    import { XPCOMUtils as foo } from "moz-src:///js/xpconnect/loader/XPCOMUtils.sys.mjs";
