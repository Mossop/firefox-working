/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * vim: sw=2 ts=2 sts=2 expandtab
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
/* eslint complexity: ["error", 53] */

"use strict";

/**
 * This module exports a provider that provides results from the Places
 * database, including history, bookmarks, and open tabs.
 */
// Constants

// AutoComplete query type constants.
// Describes the various types of queries that we can process rows for.
const QUERYTYPE_FILTERED = 0;

// The default frecency value used when inserting matches with unknown frecency.
const SCORE_DEFAULT = 100;

// The result is notified on a delay, to avoid rebuilding the panel at every match.
const NOTIFYRESULT_DELAY_MS = 16;

// Sqlite result row index constants.
const QUERYINDEX_QUERYTYPE = 0;
const QUERYINDEX_URL = 1;
const QUERYINDEX_TITLE = 2;
//    QUERYINDEX_VISITCOUNT    = 3;
//    QUERYINDEX_TYPED         = 4;
const QUERYINDEX_PLACEID = 5;
const QUERYINDEX_SCORE = 6;

function defaultQuery() {
  let query = `
    SELECT
      :query_type,
      h.url,
      h.title,
      h.visit_count,
      h.typed,
      h.id,
      (i.scrolling_time + i.typing_time + (i.view_time * 2)) AS score
    FROM moz_places h
      JOIN (
        SELECT
          place_id,
          COUNT() as count,
          SUM(total_view_time) AS view_time,
          SUM(typing_time) AS typing_time,
          SUM(key_presses) AS key_presses,
          SUM(scrolling_time) AS scrolling_time,
          SUM(scrolling_distance) AS scrolling_distance,
          MIN(created_at) AS first_interaction,
          MAX(updated_at) AS last_interaction
        FROM moz_places_metadata
        GROUP BY place_id
      ) i ON i.place_id = h.id
    WHERE
      AUTOCOMPLETE_MATCH(:searchString, h.url,
                         h.title, '',
                         h.visit_count, h.typed,
                         0, 0,
                         :matchBehavior, :searchBehavior, NULL)
    ORDER BY score DESC, i.last_interaction DESC
    LIMIT :maxResults`;
  return query;
}

// Getters

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

import {
  UrlbarProvider,
  UrlbarUtils,
} from "resource:///modules/UrlbarUtils.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  PlacesUtils: "resource://gre/modules/PlacesUtils.sys.mjs",
  UrlbarPrefs: "resource:///modules/UrlbarPrefs.sys.mjs",
  UrlbarProviderOpenTabs: "resource:///modules/UrlbarProviderOpenTabs.sys.mjs",
  UrlbarProvidersManager: "resource:///modules/UrlbarProvidersManager.sys.mjs",
  UrlbarResult: "resource:///modules/UrlbarResult.sys.mjs",
  UrlbarSearchUtils: "resource:///modules/UrlbarSearchUtils.sys.mjs",
  UrlbarTokenizer: "resource:///modules/UrlbarTokenizer.sys.mjs",
});

XPCOMUtils.defineLazyModuleGetters(lazy, {
  ObjectUtils: "resource://gre/modules/ObjectUtils.jsm",
  PromiseUtils: "resource://gre/modules/PromiseUtils.jsm",
  Sqlite: "resource://gre/modules/Sqlite.jsm",
});

function setTimeout(callback, ms) {
  let timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
  timer.initWithCallback(callback, ms, timer.TYPE_ONE_SHOT);
  return timer;
}

// Helper functions

/**
 * Returns the key to be used for a match in a map for the purposes of removing
 * duplicate entries - any 2 matches that should be considered the same should
 * return the same key.  The type of the returned key depends on the type of the
 * match, so don't assume you can compare keys using ==.  Instead, use
 * ObjectUtils.deepEqual().
 *
 * @param   {object} match
 *          The match object.
 * @returns {value} Some opaque key object.  Use ObjectUtils.deepEqual() to
 *          compare keys.
 */
function makeKeyForMatch(match) {
  let key, prefix;
  let action = lazy.PlacesUtils.parseActionUrl(match.value);
  if (!action) {
    [key, prefix] = UrlbarUtils.stripPrefixAndTrim(match.value, {
      stripHttp: true,
      stripHttps: true,
      stripWww: true,
      trimSlash: true,
      trimEmptyQuery: true,
      trimEmptyHash: true,
    });
    return [key, prefix, null];
  }

  switch (action.type) {
    case "searchengine":
      // We want to exclude search suggestion matches that simply echo back the
      // query string in the heuristic result.  For example, if the user types
      // "@engine test", we want to exclude a "test" suggestion match.
      key = [
        action.type,
        action.params.engineName,
        (
          action.params.searchSuggestion || action.params.searchQuery
        ).toLocaleLowerCase(),
      ];
      break;
    default:
      [key, prefix] = UrlbarUtils.stripPrefixAndTrim(
        action.params.url || match.value,
        {
          stripHttp: true,
          stripHttps: true,
          stripWww: true,
          trimEmptyQuery: true,
          trimSlash: true,
        }
      );
      break;
  }

  return [key, prefix, action];
}

/**
 * Converts an array of legacy match objects into UrlbarResults.
 * Note that at every call we get the full set of results, included the
 * previously returned ones, and new results may be inserted in the middle.
 * This means we could sort these wrongly, the muxer should take care of it.
 *
 * @param {UrlbarQueryContext} context the query context.
 * @param {array} matches The match objects.
 * @param {set} urls a Set containing all the found urls, used to discard
 *        already added results.
 * @returns {array} converted results
 */
function convertLegacyMatches(context, matches, urls) {
  let results = [];
  for (let match of matches) {
    // First, let's check if we already added this result.
    // `matches` always contains all of the results, includes ones
    // we may have added already. This means we'll end up adding things in the
    // wrong order here, but that's a task for the UrlbarMuxer.
    let url = match.finalCompleteValue || match.value;
    if (urls.has(url)) {
      continue;
    }
    urls.add(url);
    let result = makeUrlbarResult(context.tokens, {
      url,
      // `match.icon` is an empty string if there is no icon. Use undefined
      // instead so that tests can be simplified by not including `icon: ""` in
      // all their payloads.
      icon: match.icon || undefined,
      style: match.style,
      comment: match.comment,
      firstToken: context.tokens[0],
    });
    // Should not happen, but better safe than sorry.
    if (!result) {
      continue;
    }

    results.push(result);
  }
  return results;
}

/**
 * Creates a new UrlbarResult from the provided data.
 * @param {array} tokens the search tokens.
 * @param {object} info includes properties from the legacy result.
 * @returns {object} an UrlbarResult
 */
function makeUrlbarResult(tokens, info) {
  // This is a normal url/title tuple.
  let source = UrlbarUtils.RESULT_SOURCE.HISTORY;
  let tags = [];
  let comment = info.comment;

  return new lazy.UrlbarResult(
    UrlbarUtils.RESULT_TYPE.URL,
    source,
    ...lazy.UrlbarResult.payloadAndSimpleHighlights(tokens, {
      url: [info.url, UrlbarUtils.HIGHLIGHT.TYPED],
      icon: info.icon,
      title: [comment, UrlbarUtils.HIGHLIGHT.TYPED],
      tags: [tags, UrlbarUtils.HIGHLIGHT.TYPED],
    })
  );
}

const MATCH_TYPE = {
  HEURISTIC: "heuristic",
  GENERAL: "general",
  SUGGESTION: "suggestion",
  EXTENSION: "extension",
};

/**
 * Manages a single instance of a Places search.
 *
 * @param {UrlbarQueryContext} queryContext
 * @param {function} listener Called as: `listener(matches, searchOngoing)`
 * @param {PlacesProvider} provider
 */
function Search(queryContext, listener, provider) {
  // We want to store the original string for case sensitive searches.
  this._originalSearchString = queryContext.searchString;
  this._trimmedOriginalSearchString = queryContext.trimmedSearchString;
  let unescapedSearchString = UrlbarUtils.unEscapeURIForUI(
    this._trimmedOriginalSearchString
  );
  // We want to make sure "about:" is not stripped as a prefix so that the
  // about pages provider will run and ultimately only suggest about pages when
  // a user types "about:" into the address bar.
  let prefix, suffix;
  if (unescapedSearchString.startsWith("about:")) {
    prefix = "";
    suffix = unescapedSearchString;
  } else {
    [prefix, suffix] = UrlbarUtils.stripURLPrefix(unescapedSearchString);
  }
  this._searchString = suffix;
  this._strippedPrefix = prefix.toLowerCase();

  this._matchBehavior = Ci.mozIPlacesAutoComplete.MATCH_BOUNDARY;
  // Set the default behavior for this search.
  this._behavior = this._searchString
    ? lazy.UrlbarPrefs.get("defaultBehavior")
    : this._emptySearchDefaultBehavior;

  this._inPrivateWindow = queryContext.isPrivate;
  this._prohibitAutoFill = !queryContext.allowAutofill;
  this._maxResults = queryContext.maxResults;
  this._userContextId = queryContext.userContextId;
  this._currentPage = queryContext.currentPage;
  this._searchModeEngine = queryContext.searchMode?.engineName;
  this._searchMode = queryContext.searchMode;
  if (this._searchModeEngine) {
    // Filter Places results on host.
    let engine = Services.search.getEngineByName(this._searchModeEngine);
    this._filterOnHost = engine.getResultDomain();
  }

  this._userContextId = lazy.UrlbarProviderOpenTabs.getUserContextIdForOpenPagesTable(
    this._userContextId,
    this._inPrivateWindow
  );

  // Use the original string here, not the stripped one, so the tokenizer can
  // properly recognize token types.
  let { tokens } = lazy.UrlbarTokenizer.tokenize({
    searchString: unescapedSearchString,
    trimmedSearchString: unescapedSearchString.trim(),
  });

  // This allows to handle leading or trailing restriction characters specially.
  this._leadingRestrictionToken = null;
  if (tokens.length) {
    if (
      lazy.UrlbarTokenizer.isRestrictionToken(tokens[0]) &&
      (tokens.length > 1 ||
        tokens[0].type == lazy.UrlbarTokenizer.TYPE.RESTRICT_SEARCH)
    ) {
      this._leadingRestrictionToken = tokens[0].value;
    }

    // Check if the first token has a strippable prefix other than "about:"
    // and remove it, but don't create an empty token. We preserve "about:"
    // so that the about pages provider will run and ultimately only suggest
    // about pages when a user types "about:" into the address bar.
    if (
      prefix &&
      prefix != "about:" &&
      tokens[0].value.length > prefix.length
    ) {
      tokens[0].value = tokens[0].value.substring(prefix.length);
    }
  }

  // Eventually filter restriction tokens. In general it's a good idea, but if
  // the consumer requested search mode, we should use the full string to avoid
  // ignoring valid tokens.
  this._searchTokens =
    !queryContext || queryContext.restrictToken
      ? this.filterTokens(tokens)
      : tokens;

  // The heuristic token is the first filtered search token, but only when it's
  // actually the first thing in the search string.  If a prefix or restriction
  // character occurs first, then the heurstic token is null.  We use the
  // heuristic token to help determine the heuristic result.
  let firstToken = !!this._searchTokens.length && this._searchTokens[0].value;
  this._heuristicToken =
    firstToken && this._trimmedOriginalSearchString.startsWith(firstToken)
      ? firstToken
      : null;

  // Set the right JavaScript behavior based on our preference.  Note that the
  // preference is whether or not we should filter JavaScript, and the
  // behavior is if we should search it or not.
  if (!lazy.UrlbarPrefs.get("filter.javascript")) {
    this.setBehavior("javascript");
  }

  this._listener = listener;
  this._provider = provider;
  this._matches = [];

  // These are used to avoid adding duplicate entries to the results.
  this._usedURLs = [];
  this._usedPlaceIds = new Set();

  // Counters for the number of results per MATCH_TYPE.
  this._counts = Object.values(MATCH_TYPE).reduce((o, p) => {
    o[p] = 0;
    return o;
  }, {});
}

Search.prototype = {
  /**
   * Enables the desired AutoComplete behavior.
   *
   * @param {string} type
   *        The behavior type to set.
   */
  setBehavior(type) {
    type = type.toUpperCase();
    this._behavior |= Ci.mozIPlacesAutoComplete["BEHAVIOR_" + type];
  },

  /**
   * Determines if the specified AutoComplete behavior is set.
   *
   * @param {string} type
   *        The behavior type to test for.
   * @returns {boolean} true if the behavior is set, false otherwise.
   */
  hasBehavior(type) {
    let behavior = Ci.mozIPlacesAutoComplete["BEHAVIOR_" + type.toUpperCase()];
    return this._behavior & behavior;
  },

  /**
   * Stop this search.
   * After invoking this method, we won't run any more searches or heuristics,
   * and no new matches may be added to the current result.
   */
  stop() {
    // Avoid multiple calls or re-entrance.
    if (!this.pending) {
      return;
    }
    if (this._notifyTimer) {
      this._notifyTimer.cancel();
    }
    this._notifyDelaysCount = 0;
    if (typeof this.interrupt == "function") {
      this.interrupt();
    }
    this.pending = false;
  },

  /**
   * Whether this search is active.
   */
  pending: true,

  /**
   * Execute the search and populate results.
   * @param {mozIStorageAsyncConnection} conn
   *        The Sqlite connection.
   */
  async execute(conn) {
    // A search might be canceled before it starts.
    if (!this.pending) {
      return;
    }

    // Used by stop() to interrupt an eventual running statement.
    this.interrupt = () => {
      // Interrupt any ongoing statement to run the search sooner.
      if (!lazy.UrlbarProvidersManager.interruptLevel) {
        conn.interrupt();
      }
    };

    // For any given search, we run these queries:
    // 1) open pages not supported by history (this._switchToTabQuery)
    // 2) query based on match behavior

    // If the query is simply "@" and we have tokenAliasEngines then return
    // early. UrlbarProviderTokenAliasEngines will add engine results.
    let tokenAliasEngines = await lazy.UrlbarSearchUtils.tokenAliasEngines();
    if (this._trimmedOriginalSearchString == "@" && tokenAliasEngines.length) {
      this._provider.finishSearch(true);
      return;
    }

    if (!this.pending) {
      return;
    }

    if (this._trimmedOriginalSearchString) {
      // If the user typed the search restriction char or we're in
      // search-restriction mode, then we're done.
      // UrlbarProviderSearchSuggestions will handle suggestions, if any.
      let emptySearchRestriction =
        this._trimmedOriginalSearchString.length <= 3 &&
        this._leadingRestrictionToken == lazy.UrlbarTokenizer.RESTRICT.SEARCH &&
        /\s*\S?$/.test(this._trimmedOriginalSearchString);
      if (
        emptySearchRestriction ||
        (tokenAliasEngines &&
          this._trimmedOriginalSearchString.startsWith("@")) ||
        (this.hasBehavior("search") && this.hasBehavior("restrict"))
      ) {
        this._provider.finishSearch(true);
        return;
      }
    }

    // Run our standard Places query.
    let queries = [];
    queries.push(this._searchQuery);
    for (let [query, params] of queries) {
      await conn.executeCached(query, params, this._onResultRow.bind(this));
      if (!this.pending) {
        return;
      }
    }

    // If we do not have enough matches search again with MATCH_ANYWHERE, to
    // get more matches.
    let count = this._counts[MATCH_TYPE.GENERAL];
    if (count < this._maxResults) {
      this._matchBehavior = Ci.mozIPlacesAutoComplete.MATCH_ANYWHERE;
      queries = [this._searchQuery];
      for (let [query, params] of queries) {
        await conn.executeCached(query, params, this._onResultRow.bind(this));
        if (!this.pending) {
          return;
        }
      }
    }
  },

  _onResultRow(row, cancel) {
    let queryType = row.getResultByIndex(QUERYINDEX_QUERYTYPE);
    switch (queryType) {
      case QUERYTYPE_FILTERED:
        this._addFilteredQueryMatch(row);
        break;
    }
    // If the search has been canceled by the user or by _addMatch, or we
    // fetched enough results, we can stop the underlying Sqlite query.
    let count = this._counts[MATCH_TYPE.GENERAL];
    if (!this.pending || count >= this._maxResults) {
      cancel();
    }
  },

  _addMatch(match) {
    if (typeof match.score != "number") {
      throw new Error("Score not provided");
    }

    if (typeof match.type != "string") {
      match.type = MATCH_TYPE.GENERAL;
    }

    // A search could be canceled between a query start and its completion,
    // in such a case ensure we won't notify any result for it.
    if (!this.pending) {
      return;
    }

    match.style = match.style || "favicon";

    // Restyle past searches, unless they are bookmarks or special results.
    if (
      match.style == "favicon" &&
      (lazy.UrlbarPrefs.get("restyleSearches") || this._searchModeEngine)
    ) {
      let restyled = this._maybeRestyleSearchMatch(match);
      if (
        restyled &&
        lazy.UrlbarPrefs.get("maxHistoricalSearchSuggestions") == 0
      ) {
        // The user doesn't want search history.
        return;
      }
    }

    match.icon = match.icon || "";
    match.finalCompleteValue = match.finalCompleteValue || "";

    let { index, replace } = this._getInsertIndexForMatch(match);
    if (index == -1) {
      return;
    }
    if (replace) {
      // Replacing an existing match from the previous search.
      this._matches.splice(index, 1);
    }
    this._matches.splice(index, 0, match);
    this._counts[match.type]++;

    this.notifyResult(true);
  },

  /**
   * Check for duplicates and either discard the duplicate or replace the
   * original match, in case the new one is more specific. For example,
   * a Remote Tab wins over History, and a Switch to Tab wins over a Remote Tab.
   * We must check both id and url for duplication, because keywords may change
   * the url by replacing the %s placeholder.
   * @param {object} match
   * @returns {object} matchPosition
   * @returns {number} matchPosition.index
   *   The index the match should take in the results. Return -1 if the match
   *   should be discarded.
   * @returns {boolean} matchPosition.replace
   *   True if the match should replace the result already at
   *   matchPosition.index.
   *
   */
  _getInsertIndexForMatch(match) {
    let [urlMapKey, prefix, action] = makeKeyForMatch(match);
    if (
      (match.placeId && this._usedPlaceIds.has(match.placeId)) ||
      this._usedURLs.some(e => lazy.ObjectUtils.deepEqual(e.key, urlMapKey))
    ) {
      let isDupe = true;
      if (action && ["switchtab", "remotetab"].includes(action.type)) {
        // The new entry is a switch/remote tab entry, look for the duplicate
        // among current matches.
        for (let i = 0; i < this._usedURLs.length; ++i) {
          let { key: matchKey, action: matchAction } = this._usedURLs[i];
          if (lazy.ObjectUtils.deepEqual(matchKey, urlMapKey)) {
            isDupe = true;
            if (!matchAction || action.type == "switchtab") {
              this._usedURLs[i] = {
                key: urlMapKey,
                action,
                type: match.type,
                prefix,
                comment: match.comment,
              };
              return { index: i, replace: true };
            }
            break; // Found the duplicate, no reason to continue.
          }
        }
      } else {
        // Dedupe with this flow:
        // 1. If the two URLs are the same, dedupe the newer one.
        // 2. If they both contain www. or both do not contain it, prefer https.
        // 3. If they differ by www., send both results to the Muxer and allow
        //    it to decide based on results from other providers.
        let prefixRank = UrlbarUtils.getPrefixRank(prefix);
        for (let i = 0; i < this._usedURLs.length; ++i) {
          if (!this._usedURLs[i]) {
            // This is true when the result at [i] is a searchengine result.
            continue;
          }

          let { key: existingKey, prefix: existingPrefix } = this._usedURLs[i];

          let existingPrefixRank = UrlbarUtils.getPrefixRank(existingPrefix);
          if (lazy.ObjectUtils.deepEqual(existingKey, urlMapKey)) {
            isDupe = true;

            if (prefix == existingPrefix) {
              // The URLs are identical. Throw out the new result.
              break;
            }

            if (prefix.endsWith("www.") == existingPrefix.endsWith("www.")) {
              // The results differ only by protocol.
              if (prefixRank <= existingPrefixRank) {
                break; // Replace match.
              } else {
                this._usedURLs[i] = {
                  key: urlMapKey,
                  action,
                  type: match.type,
                  prefix,
                  comment: match.comment,
                };
                return { index: i, replace: true };
              }
            } else {
              // We have two identical URLs that differ only by www. We need to
              // be sure what the heuristic result is before deciding how we
              // should dedupe. We mark these as non-duplicates and let the
              // muxer handle it.
              isDupe = false;
              continue;
            }
          }
        }
      }

      // Discard the duplicate.
      if (isDupe) {
        return { index: -1, replace: false };
      }
    }

    // Add this to our internal tracker to ensure duplicates do not end up in
    // the result.
    // Not all entries have a place id, thus we fallback to the url for them.
    // We cannot use only the url since keywords entries are modified to
    // include the search string, and would be returned multiple times.  Ids
    // are faster too.
    if (match.placeId) {
      this._usedPlaceIds.add(match.placeId);
    }

    let index = 0;
    if (!this._groups) {
      this._groups = [];
      this._makeGroups(lazy.UrlbarPrefs.get("resultGroups"), this._maxResults);
    }

    let replace = 0;
    for (let group of this._groups) {
      // Move to the next group if the match type is incompatible, or if there
      // is no available space or if the frecency is below the threshold.
      if (match.type != group.type || !group.available) {
        index += group.count;
        continue;
      }

      index += group.insertIndex;
      group.available--;
      if (group.insertIndex < group.count) {
        replace = true;
      } else {
        group.count++;
      }
      group.insertIndex++;
      break;
    }
    this._usedURLs[index] = {
      key: urlMapKey,
      action,
      type: match.type,
      prefix,
      comment: match.comment || "",
    };
    return { index, replace };
  },

  _makeGroups(resultGroup, maxResultCount) {
    if (!resultGroup.children) {
      let type;
      switch (resultGroup.group) {
        case UrlbarUtils.RESULT_GROUP.FORM_HISTORY:
        case UrlbarUtils.RESULT_GROUP.REMOTE_SUGGESTION:
        case UrlbarUtils.RESULT_GROUP.TAIL_SUGGESTION:
          type = MATCH_TYPE.SUGGESTION;
          break;
        case UrlbarUtils.RESULT_GROUP.HEURISTIC_AUTOFILL:
        case UrlbarUtils.RESULT_GROUP.HEURISTIC_EXTENSION:
        case UrlbarUtils.RESULT_GROUP.HEURISTIC_FALLBACK:
        case UrlbarUtils.RESULT_GROUP.HEURISTIC_OMNIBOX:
        case UrlbarUtils.RESULT_GROUP.HEURISTIC_SEARCH_TIP:
        case UrlbarUtils.RESULT_GROUP.HEURISTIC_TEST:
        case UrlbarUtils.RESULT_GROUP.HEURISTIC_TOKEN_ALIAS_ENGINE:
          type = MATCH_TYPE.HEURISTIC;
          break;
        case UrlbarUtils.RESULT_GROUP.OMNIBOX:
          type = MATCH_TYPE.EXTENSION;
          break;
        default:
          type = MATCH_TYPE.GENERAL;
          break;
      }
      if (this._groups.length) {
        let last = this._groups[this._groups.length - 1];
        if (last.type == type) {
          return;
        }
      }
      // - `available` is the number of available slots in the group
      // - `insertIndex` is the index of the first available slot in the group
      // - `count` is the number of matches in the group, note that it also
      //   accounts for matches from the previous search, while `available` and
      //   `insertIndex` don't.
      this._groups.push({
        type,
        available: maxResultCount,
        insertIndex: 0,
        count: 0,
      });
      return;
    }

    let initialMaxResultCount;
    if (typeof resultGroup.maxResultCount == "number") {
      initialMaxResultCount = resultGroup.maxResultCount;
    } else if (typeof resultGroup.availableSpan == "number") {
      initialMaxResultCount = resultGroup.availableSpan;
    } else {
      initialMaxResultCount = this._maxResults;
    }
    let childMaxResultCount = Math.min(initialMaxResultCount, maxResultCount);
    for (let child of resultGroup.children) {
      this._makeGroups(child, childMaxResultCount);
    }
  },

  _addFilteredQueryMatch(row) {
    let placeId = row.getResultByIndex(QUERYINDEX_PLACEID);
    let url = row.getResultByIndex(QUERYINDEX_URL);
    let historyTitle = row.getResultByIndex(QUERYINDEX_TITLE) || "";
    let score = row.getResultByIndex(QUERYINDEX_SCORE);

    this._addMatch({
      placeId,
      value: url,
      comment: historyTitle,
      icon: UrlbarUtils.getIconForUrl(url),
      score: score || SCORE_DEFAULT,
      style: "favicon",
    });
  },

  /**
   * @returns {string}
   * A string consisting of the search query to be used based on the previously
   * set urlbar suggestion preferences.
   */
  get _suggestionPrefQuery() {
    return defaultQuery();
  },

  get _emptySearchDefaultBehavior() {
    // Further restrictions to apply for "empty searches" (searching for
    // "").  The empty behavior is typed history, if history is enabled.
    // Otherwise, it is bookmarks, if they are enabled. If both history and
    // bookmarks are disabled, it defaults to open pages.
    let val = Ci.mozIPlacesAutoComplete.BEHAVIOR_RESTRICT;
    if (lazy.UrlbarPrefs.get("suggest.history")) {
      val |= Ci.mozIPlacesAutoComplete.BEHAVIOR_HISTORY;
    } else if (lazy.UrlbarPrefs.get("suggest.bookmark")) {
      val |= Ci.mozIPlacesAutoComplete.BEHAVIOR_BOOKMARK;
    } else {
      val |= Ci.mozIPlacesAutoComplete.BEHAVIOR_OPENPAGE;
    }
    return val;
  },

  /**
   * If the user-provided string starts with a keyword that gave a heuristic
   * result, this will strip it.
   * @returns {string} The filtered search string.
   */
  get _keywordFilteredSearchString() {
    let tokens = this._searchTokens.map(t => t.value);
    if (this._firstTokenIsKeyword) {
      tokens = tokens.slice(1);
    }
    return tokens.join(" ");
  },

  /**
   * Obtains the search query to be used based on the previously set search
   * preferences (accessed by this.hasBehavior).
   *
   * @returns {array}
   *   An array consisting of the correctly optimized query to search the
   *   database with and an object containing the params to bound.
   */
  get _searchQuery() {
    let params = {
      query_type: QUERYTYPE_FILTERED,
      matchBehavior: this._matchBehavior,
      searchBehavior: this._behavior,
      // We only want to search the tokens that we are left with - not the
      // original search string.
      searchString: this._keywordFilteredSearchString,
      // Limit the query to the the maximum number of desired results.
      // This way we can avoid doing more work than needed.
      maxResults: this._maxResults,
    };
    if (this._filterOnHost) {
      params.host = this._filterOnHost;
    }
    return [this._suggestionPrefQuery, params];
  },

  // The result is notified to the search listener on a timer, to chunk multiple
  // match updates together and avoid rebuilding the popup at every new match.
  _notifyTimer: null,

  /**
   * Notifies the current result to the listener.
   *
   * @param searchOngoing
   *        Indicates whether the search result should be marked as ongoing.
   */
  _notifyDelaysCount: 0,
  notifyResult(searchOngoing) {
    let notify = () => {
      if (!this.pending) {
        return;
      }
      this._notifyDelaysCount = 0;
      this._listener(this._matches, searchOngoing);
      if (!searchOngoing) {
        // Break possible cycles.
        this._listener = null;
        this._provider = null;
        this.stop();
      }
    };
    if (this._notifyTimer) {
      this._notifyTimer.cancel();
    }
    // In the worst case, we may get evenly spaced matches that would end up
    // delaying the UI by N_MATCHES * NOTIFYRESULT_DELAY_MS. Thus, we clamp the
    // number of times we may delay matches.
    if (this._notifyDelaysCount > 3) {
      notify();
    } else {
      this._notifyDelaysCount++;
      this._notifyTimer = setTimeout(notify, NOTIFYRESULT_DELAY_MS);
    }
  },
};

/**
 * Class used to create the provider.
 */
class ProviderInteractions extends UrlbarProvider {
  // Promise resolved when the database initialization has completed, or null
  // if it has never been requested.
  _promiseDatabase = null;

  /**
   * Returns the name of this provider.
   * @returns {string} the name of this provider.
   */
  get name() {
    return "Interactions";
  }

  /**
   * Returns the type of this provider.
   * @returns {integer} one of the types from UrlbarUtils.PROVIDER_TYPE.*
   */
  get type() {
    return UrlbarUtils.PROVIDER_TYPE.PROFILE;
  }

  /**
   * Gets a Sqlite database handle.
   *
   * @returns {Promise}
   * @resolves to the Sqlite database handle (according to Sqlite.jsm).
   * @rejects javascript exception.
   */
  getDatabaseHandle() {
    if (!this._promiseDatabase) {
      this._promiseDatabase = (async () => {
        let conn = await lazy.PlacesUtils.promiseLargeCacheDBConnection();

        // We don't catch exceptions here as it is too late to block shutdown.
        lazy.Sqlite.shutdown.addBlocker("UrlbarProviderPlaces closing", () => {
          // Break a possible cycle through the
          // previous result, the controller and
          // ourselves.
          this._currentSearch = null;
        });

        return conn;
      })().catch(ex => {
        dump("Couldn't get database handle: " + ex + "\n");
        this.logger.error(ex);
      });
    }
    return this._promiseDatabase;
  }

  /**
   * Whether this provider should be invoked for the given context.
   * If this method returns false, the providers manager won't start a query
   * with this provider, to save on resources.
   * @param {UrlbarQueryContext} queryContext The query context object
   * @returns {boolean} Whether this provider should be invoked for the search.
   */
  isActive(queryContext) {
    if (
      !queryContext.trimmedSearchString &&
      queryContext.searchMode?.engineName &&
      lazy.UrlbarPrefs.get("update2.emptySearchBehavior") < 2
    ) {
      return false;
    }
    return true;
  }

  /**
   * Starts querying.
   * @param {object} queryContext The query context object
   * @param {function} addCallback Callback invoked by the provider to add a new
   *        result.
   * @returns {Promise} resolved when the query stops.
   */
  startQuery(queryContext, addCallback) {
    let instance = this.queryInstance;
    let urls = new Set();
    this._startLegacyQuery(queryContext, matches => {
      if (instance != this.queryInstance) {
        return;
      }
      let results = convertLegacyMatches(queryContext, matches, urls);
      for (let result of results) {
        addCallback(this, result);
      }
    });
    return this._deferred.promise;
  }

  /**
   * Cancels a running query.
   * @param {object} queryContext The query context object
   */
  cancelQuery(queryContext) {
    if (this._currentSearch) {
      this._currentSearch.stop();
    }
    if (this._deferred) {
      this._deferred.resolve();
    }
    // Don't notify since we are canceling this search.  This also means we
    // won't fire onSearchComplete for this search.
    this.finishSearch();
  }

  /**
   * Properly cleans up when searching is completed.
   *
   * @param {boolean} [notify]
   *        Indicates if we should notify the AutoComplete listener about our
   *        results or not. Default false.
   */
  finishSearch(notify = false) {
    // Clear state now to avoid race conditions, see below.
    let search = this._currentSearch;
    if (!search) {
      return;
    }
    this._lastLowResultsSearchSuggestion =
      search._lastLowResultsSearchSuggestion;

    if (!notify || !search.pending) {
      return;
    }

    // There is a possible race condition here.
    // When a search completes it calls finishSearch that notifies results
    // here.  When the controller gets the last result it fires
    // onSearchComplete.
    // If onSearchComplete immediately starts a new search it will set a new
    // _currentSearch, and on return the execution will continue here, after
    // notifyResult.
    // Thus, ensure that notifyResult is the last call in this method,
    // otherwise you might be touching the wrong search.
    search.notifyResult(false);
  }

  _startLegacyQuery(queryContext, callback) {
    let deferred = lazy.PromiseUtils.defer();
    let listener = (matches, searchOngoing) => {
      callback(matches);
      if (!searchOngoing) {
        deferred.resolve();
      }
    };
    this._startSearch(queryContext.searchString, listener, queryContext);
    this._deferred = deferred;
  }

  _startSearch(searchString, listener, queryContext) {
    // Stop the search in case the controller has not taken care of it.
    if (this._currentSearch) {
      this.cancelQuery();
    }

    let search = (this._currentSearch = new Search(
      queryContext,
      listener,
      this
    ));
    this.getDatabaseHandle()
      .then(conn => search.execute(conn))
      .catch(ex => {
        dump(`Query failed: ${ex}\n`);
        this.logger.error(ex);
      })
      .then(() => {
        if (search == this._currentSearch) {
          this.finishSearch(true);
        }
      });
  }
}

export var UrlbarProviderInteractions = new ProviderInteractions();
