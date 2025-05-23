/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {
  Component,
  createFactory,
} = require("resource://devtools/client/shared/vendor/react.mjs");
const dom = require("resource://devtools/client/shared/vendor/react-dom-factories.js");
const PropTypes = require("resource://devtools/client/shared/vendor/react-prop-types.mjs");
const {
  fetchNetworkUpdatePacket,
  propertiesEqual,
} = require("resource://devtools/client/netmonitor/src/utils/request-utils.js");
const {
  PANELS,
  RESPONSE_HEADERS,
} = require("resource://devtools/client/netmonitor/src/constants.js");

// Components
/* global
  RequestListColumnInitiator,
  RequestListColumnContentSize,
  RequestListColumnCookies,
  RequestListColumnDomain,
  RequestListColumnFile,
  RequestListColumnPath,
  RequestListColumnMethod,
  RequestListColumnProtocol,
  RequestListColumnRemoteIP,
  RequestListColumnResponseHeader,
  RequestListColumnScheme,
  RequestListColumnSetCookies,
  RequestListColumnStatus,
  RequestListColumnTime,
  RequestListColumnTransferredSize,
  RequestListColumnType,
  RequestListColumnUrl,
  RequestListColumnWaterfall,
  RequestListColumnPriority
*/
loader.lazyGetter(this, "RequestListColumnInitiator", function () {
  return createFactory(
    require("resource://devtools/client/netmonitor/src/components/request-list/RequestListColumnInitiator.js")
  );
});
loader.lazyGetter(this, "RequestListColumnContentSize", function () {
  return createFactory(
    require("resource://devtools/client/netmonitor/src/components/request-list/RequestListColumnContentSize.js")
  );
});
loader.lazyGetter(this, "RequestListColumnCookies", function () {
  return createFactory(
    require("resource://devtools/client/netmonitor/src/components/request-list/RequestListColumnCookies.js")
  );
});
loader.lazyGetter(this, "RequestListColumnDomain", function () {
  return createFactory(
    require("resource://devtools/client/netmonitor/src/components/request-list/RequestListColumnDomain.js")
  );
});
loader.lazyGetter(this, "RequestListColumnFile", function () {
  return createFactory(
    require("resource://devtools/client/netmonitor/src/components/request-list/RequestListColumnFile.js")
  );
});
loader.lazyGetter(this, "RequestListColumnPath", function () {
  return createFactory(
    require("resource://devtools/client/netmonitor/src/components/request-list/RequestListColumnPath.js")
  );
});
loader.lazyGetter(this, "RequestListColumnUrl", function () {
  return createFactory(
    require("resource://devtools/client/netmonitor/src/components/request-list/RequestListColumnUrl.js")
  );
});
loader.lazyGetter(this, "RequestListColumnMethod", function () {
  return createFactory(
    require("resource://devtools/client/netmonitor/src/components/request-list/RequestListColumnMethod.js")
  );
});
loader.lazyGetter(this, "RequestListColumnOverride", function () {
  return createFactory(
    require("resource://devtools/client/netmonitor/src/components/request-list/RequestListColumnOverride.js")
  );
});
loader.lazyGetter(this, "RequestListColumnProtocol", function () {
  return createFactory(
    require("resource://devtools/client/netmonitor/src/components/request-list/RequestListColumnProtocol.js")
  );
});
loader.lazyGetter(this, "RequestListColumnRemoteIP", function () {
  return createFactory(
    require("resource://devtools/client/netmonitor/src/components/request-list/RequestListColumnRemoteIP.js")
  );
});
loader.lazyGetter(this, "RequestListColumnResponseHeader", function () {
  return createFactory(
    require("resource://devtools/client/netmonitor/src/components/request-list/RequestListColumnResponseHeader.js")
  );
});
loader.lazyGetter(this, "RequestListColumnTime", function () {
  return createFactory(
    require("resource://devtools/client/netmonitor/src/components/request-list/RequestListColumnTime.js")
  );
});
loader.lazyGetter(this, "RequestListColumnScheme", function () {
  return createFactory(
    require("resource://devtools/client/netmonitor/src/components/request-list/RequestListColumnScheme.js")
  );
});
loader.lazyGetter(this, "RequestListColumnSetCookies", function () {
  return createFactory(
    require("resource://devtools/client/netmonitor/src/components/request-list/RequestListColumnSetCookies.js")
  );
});
loader.lazyGetter(this, "RequestListColumnStatus", function () {
  return createFactory(
    require("resource://devtools/client/netmonitor/src/components/request-list/RequestListColumnStatus.js")
  );
});
loader.lazyGetter(this, "RequestListColumnTransferredSize", function () {
  return createFactory(
    require("resource://devtools/client/netmonitor/src/components/request-list/RequestListColumnTransferredSize.js")
  );
});
loader.lazyGetter(this, "RequestListColumnType", function () {
  return createFactory(
    require("resource://devtools/client/netmonitor/src/components/request-list/RequestListColumnType.js")
  );
});
loader.lazyGetter(this, "RequestListColumnWaterfall", function () {
  return createFactory(
    require("resource://devtools/client/netmonitor/src/components/request-list/RequestListColumnWaterfall.js")
  );
});
loader.lazyGetter(this, "RequestListColumnPriority", function () {
  return createFactory(
    require("resource://devtools/client/netmonitor/src/components/request-list/RequestListColumnPriority.js")
  );
});

/**
 * Used by shouldComponentUpdate: compare two items, and compare only properties
 * relevant for rendering the RequestListItem. Other properties (like request and
 * response headers, cookies, bodies) are ignored. These are very useful for the
 * network details, but not here.
 */
const UPDATED_REQ_ITEM_PROPS = [
  "mimeType",
  "eventTimings",
  "earlyHintsStatus",
  "securityState",
  "status",
  "statusText",
  "fromCache",
  "isRacing",
  "fromServiceWorker",
  "method",
  "url",
  "remoteAddress",
  "cause",
  "contentSize",
  "transferredSize",
  "startedMs",
  "totalTime",
  "requestCookies",
  "requestHeaders",
  "responseCookies",
  "responseHeaders",
  "waitingTime",
  "isEventStream",
  "priority",
];

const UPDATED_REQ_PROPS = [
  "firstRequestStartedMs",
  "index",
  "networkDetailsOpen",
  "isSelected",
  "isVisible",
  "requestFilterTypes",
  "waterfallScale",
];

/**
 * Used by render: renders the given ColumnComponent if the flag for this column
 * is set in the columns prop. The list of props are used to determine which of
 * RequestListItem's need to be passed to the ColumnComponent. Any objects contained
 * in that list are passed as props verbatim.
 */
const COLUMN_COMPONENTS = [
  { column: "override", ColumnComponent: RequestListColumnOverride },
  { column: "status", ColumnComponent: RequestListColumnStatus },
  { column: "method", ColumnComponent: RequestListColumnMethod },
  {
    column: "domain",
    ColumnComponent: RequestListColumnDomain,
    props: ["onSecurityIconMouseDown"],
  },
  {
    column: "file",
    ColumnComponent: RequestListColumnFile,
    props: ["onWaterfallMouseDown", "slowLimit"],
  },
  {
    column: "path",
    ColumnComponent: RequestListColumnPath,
    props: ["onWaterfallMouseDown"],
  },
  {
    column: "url",
    ColumnComponent: RequestListColumnUrl,
    props: ["onSecurityIconMouseDown"],
  },
  { column: "protocol", ColumnComponent: RequestListColumnProtocol },
  { column: "scheme", ColumnComponent: RequestListColumnScheme },
  { column: "remoteip", ColumnComponent: RequestListColumnRemoteIP },
  {
    column: "initiator",
    ColumnComponent: RequestListColumnInitiator,
    props: ["onInitiatorBadgeMouseDown"],
  },
  { column: "type", ColumnComponent: RequestListColumnType },
  {
    column: "cookies",
    ColumnComponent: RequestListColumnCookies,
    props: ["connector"],
  },
  {
    column: "setCookies",
    ColumnComponent: RequestListColumnSetCookies,
    props: ["connector"],
  },
  { column: "transferred", ColumnComponent: RequestListColumnTransferredSize },
  { column: "contentSize", ColumnComponent: RequestListColumnContentSize },
  { column: "priority", ColumnComponent: RequestListColumnPriority },
  {
    column: "startTime",
    ColumnComponent: RequestListColumnTime,
    props: ["connector", "firstRequestStartedMs", { type: "start" }],
  },
  {
    column: "endTime",
    ColumnComponent: RequestListColumnTime,
    props: ["connector", "firstRequestStartedMs", { type: "end" }],
  },
  {
    column: "responseTime",
    ColumnComponent: RequestListColumnTime,
    props: ["connector", "firstRequestStartedMs", { type: "response" }],
  },
  {
    column: "duration",
    ColumnComponent: RequestListColumnTime,
    props: ["connector", "firstRequestStartedMs", { type: "duration" }],
  },
  {
    column: "latency",
    ColumnComponent: RequestListColumnTime,
    props: ["connector", "firstRequestStartedMs", { type: "latency" }],
  },
];

/**
 * Render one row in the request list.
 */
class RequestListItem extends Component {
  static get propTypes() {
    return {
      blocked: PropTypes.bool,
      columns: PropTypes.object.isRequired,
      connector: PropTypes.object.isRequired,
      firstRequestStartedMs: PropTypes.number.isRequired,
      fromCache: PropTypes.bool,
      item: PropTypes.object.isRequired,
      index: PropTypes.number.isRequired,
      intersectionObserver: PropTypes.object,
      isSelected: PropTypes.bool.isRequired,
      isVisible: PropTypes.bool.isRequired,
      networkActionOpen: PropTypes.bool,
      networkDetailsOpen: PropTypes.bool,
      onContextMenu: PropTypes.func.isRequired,
      onDoubleClick: PropTypes.func.isRequired,
      onDragStart: PropTypes.func.isRequired,
      onFocusedNodeChange: PropTypes.func,
      onInitiatorBadgeMouseDown: PropTypes.func.isRequired,
      onMouseDown: PropTypes.func.isRequired,
      onSecurityIconMouseDown: PropTypes.func.isRequired,
      onWaterfallMouseDown: PropTypes.func.isRequired,
      overriddenUrl: PropTypes.string,
      requestFilterTypes: PropTypes.object.isRequired,
      selectedActionBarTabId: PropTypes.string,
      waterfallScale: PropTypes.number,
    };
  }

  componentDidMount() {
    if (this.props.isSelected) {
      this.refs.listItem.focus();
    }
    if (this.props.intersectionObserver) {
      this.props.intersectionObserver.observe(this.refs.listItem);
    }

    const { connector, item, requestFilterTypes } = this.props;
    // Filtering XHR & WS require to lazily fetch requestHeaders & responseHeaders
    if (requestFilterTypes.xhr || requestFilterTypes.ws) {
      fetchNetworkUpdatePacket(connector.requestData, item, [
        "requestHeaders",
        "responseHeaders",
      ]);
    }
  }

  // FIXME: https://bugzilla.mozilla.org/show_bug.cgi?id=1774507
  UNSAFE_componentWillReceiveProps(nextProps) {
    const { connector, item, requestFilterTypes } = nextProps;
    // Filtering XHR & WS require to lazily fetch requestHeaders & responseHeaders
    if (requestFilterTypes.xhr || requestFilterTypes.ws) {
      fetchNetworkUpdatePacket(connector.requestData, item, [
        "requestHeaders",
        "responseHeaders",
      ]);
    }
  }

  shouldComponentUpdate(nextProps) {
    return (
      !propertiesEqual(
        UPDATED_REQ_ITEM_PROPS,
        this.props.item,
        nextProps.item
      ) ||
      !propertiesEqual(UPDATED_REQ_PROPS, this.props, nextProps) ||
      this.props.columns !== nextProps.columns ||
      nextProps.overriddenUrl !== this.props.overriddenUrl
    );
  }

  componentDidUpdate(prevProps) {
    if (!prevProps.isSelected && this.props.isSelected) {
      this.refs.listItem.focus();
      if (this.props.onFocusedNodeChange) {
        this.props.onFocusedNodeChange();
      }
    }
  }

  componentWillUnmount() {
    if (this.props.intersectionObserver) {
      this.props.intersectionObserver.unobserve(this.refs.listItem);
    }
  }

  render() {
    const {
      blocked,
      connector,
      columns,
      item,
      index,
      isSelected,
      isVisible,
      firstRequestStartedMs,
      fromCache,
      networkActionOpen,
      onDoubleClick,
      onDragStart,
      onContextMenu,
      onMouseDown,
      onWaterfallMouseDown,
      selectedActionBarTabId,
      waterfallScale,
    } = this.props;

    const classList = ["request-list-item", index % 2 ? "odd" : "even"];
    isSelected && classList.push("selected");
    fromCache && classList.push("fromCache");
    blocked && classList.push("blocked");

    return dom.tr(
      {
        ref: "listItem",
        className: classList.join(" "),
        "data-id": item.id,
        draggable:
          !blocked &&
          networkActionOpen &&
          selectedActionBarTabId === PANELS.BLOCKING,
        tabIndex: 0,
        onContextMenu,
        onMouseDown,
        onDoubleClick,
        onDragStart,
      },
      ...COLUMN_COMPONENTS.filter(({ column }) => columns[column]).map(
        ({ column, ColumnComponent, props: columnProps }) => {
          return ColumnComponent({
            key: column,
            item,
            ...(columnProps || []).reduce((acc, keyOrObject) => {
              if (typeof keyOrObject == "string") {
                acc[keyOrObject] = this.props[keyOrObject];
              } else {
                Object.assign(acc, keyOrObject);
              }
              return acc;
            }, {}),
          });
        }
      ),
      ...RESPONSE_HEADERS.filter(header => columns[header]).map(header =>
        RequestListColumnResponseHeader({
          connector,
          item,
          header,
        })
      ),
      // The last column is Waterfall (aka Timeline)
      columns.waterfall &&
        RequestListColumnWaterfall({
          connector,
          firstRequestStartedMs,
          item,
          onWaterfallMouseDown,
          isVisible,
          waterfallScale,
        })
    );
  }
}

module.exports = RequestListItem;
