/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  createFactory,
  Component,
} from "resource://devtools/client/shared/vendor/react.mjs";
import * as dom from "resource://devtools/client/shared/vendor/react-dom-factories.mjs";
import PropTypes from "resource://devtools/client/shared/vendor/react-prop-types.mjs";
import { createFactories } from "resource://devtools/client/shared/react-utils.mjs";

import TreeViewClass from "resource://devtools/client/shared/components/tree/TreeView.mjs";
import JsonToolbarClass from "resource://devtools/client/jsonview/components/JsonToolbar.mjs";

import {
  JSON_NUMBER,
  MODE,
} from "resource://devtools/client/shared/components/reps/reps/constants.mjs";
import { Rep } from "resource://devtools/client/shared/components/reps/reps/rep.mjs";

const TreeView = createFactory(TreeViewClass);
const { JsonToolbar } = createFactories(JsonToolbarClass);
const { div } = dom;

const MAX_STRING_LENGTH = 250;

function isObject(value) {
  return Object(value) === value;
}

/**
 * This template represents the 'JSON' panel. The panel is
 * responsible for rendering an expandable tree that allows simple
 * inspection of JSON structure.
 */
class JsonPanel extends Component {
  static get propTypes() {
    return {
      data: PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.array,
        PropTypes.object,
        PropTypes.bool,
        PropTypes.number,
      ]),
      dataSize: PropTypes.number,
      expandedNodes: PropTypes.instanceOf(Set),
      searchFilter: PropTypes.string,
      actions: PropTypes.object,
    };
  }

  constructor(props) {
    super(props);
    this.state = {};
    this.onKeyPress = this.onKeyPress.bind(this);
    this.onFilter = this.onFilter.bind(this);
    this.renderValue = this.renderValue.bind(this);
    this.renderTree = this.renderTree.bind(this);
  }

  componentDidMount() {
    document.addEventListener("keypress", this.onKeyPress, true);
    document.getElementById("json-scrolling-panel").focus();
  }

  componentWillUnmount() {
    document.removeEventListener("keypress", this.onKeyPress, true);
  }

  onKeyPress() {
    // XXX shortcut for focusing the Filter field (see Bug 1178771).
  }

  onFilter(object) {
    if (!this.props.searchFilter) {
      return true;
    }

    const json = object.name + JSON.stringify(object.value);
    return json.toLowerCase().includes(this.props.searchFilter.toLowerCase());
  }

  renderValue(props) {
    const member = props.member;

    // Hide object summary when non-empty object is expanded (bug 1244912).
    if (isObject(member.value) && member.hasChildren && member.open) {
      return null;
    }

    // Render the value (summary) using Reps library.
    return Rep(
      Object.assign({}, props, {
        cropLimit: MAX_STRING_LENGTH,
        noGrip: true,
        isInContentPage: true,
      })
    );
  }

  renderTree() {
    // Append custom column for displaying values. This column
    // Take all available horizontal space.
    const columns = [
      {
        id: "value",
        width: "100%",
      },
    ];

    // Render tree component.
    return TreeView({
      object: this.props.data,
      mode: MODE.LONG,
      onFilter: this.onFilter,
      columns,
      renderValue: this.renderValue,
      expandedNodes: this.props.expandedNodes,
      maxStringLength: MAX_STRING_LENGTH,
    });
  }

  render() {
    let content;
    const data = this.props.data;

    if (!isObject(data)) {
      content = div(
        { className: "jsonPrimitiveValue" },
        Rep({
          object: data,
        })
      );
    } else if (data instanceof Error) {
      content = div({ className: "jsonParseError" }, data + "");
    } else if (data.type === JSON_NUMBER) {
      content = div(
        { className: "jsonPrimitiveValue" },
        Rep({
          object: data,
          noGrip: true,
        })
      );
    } else {
      content = this.renderTree();
    }

    return div(
      { className: "jsonPanelBox tab-panel-inner" },
      JsonToolbar({
        actions: this.props.actions,
        dataSize: this.props.dataSize,
      }),
      div(
        {
          className: "panelContent",
          id: "json-scrolling-panel",
          tabIndex: 0,
        },
        content
      )
    );
  }
}

export default { JsonPanel };
