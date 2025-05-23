/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.syncedtabs

import android.graphics.drawable.Drawable
import androidx.annotation.VisibleForTesting
import mozilla.components.browser.icons.BrowserIcons
import mozilla.components.browser.icons.IconRequest
import mozilla.components.concept.awesomebar.AwesomeBar
import mozilla.components.concept.awesomebar.AwesomeBar.Suggestion.Flag
import mozilla.components.concept.sync.DeviceType
import mozilla.components.feature.session.SessionUseCases
import mozilla.components.feature.syncedtabs.ext.getActiveDeviceTabs
import mozilla.components.feature.syncedtabs.facts.emitSyncedTabSuggestionClickedFact
import mozilla.components.feature.syncedtabs.storage.SyncedTabsStorage
import java.util.UUID

/**
 * A [AwesomeBar.SuggestionProvider] implementation that provides suggestions for remote tabs
 * based on [SyncedTabsStorage].
 */
class SyncedTabsStorageSuggestionProvider(
    private val syncedTabs: SyncedTabsStorage,
    private val loadUrlUseCase: SessionUseCases.LoadUrlUseCase,
    private val icons: BrowserIcons? = null,
    private val deviceIndicators: DeviceIndicators = DeviceIndicators(),
    private val suggestionsHeader: String? = null,
    @get:VisibleForTesting val resultsUrlFilter: ((String) -> Boolean)? = null,
) : AwesomeBar.SuggestionProvider {
    override val id: String = UUID.randomUUID().toString()

    override fun groupTitle(): String? {
        return suggestionsHeader
    }

    override suspend fun onInputChanged(text: String): List<AwesomeBar.Suggestion> {
        if (text.isEmpty()) {
            return emptyList()
        }

        val results = syncedTabs.getActiveDeviceTabs { tab ->
            // This is a fairly naive match implementation, but this is what we do on Desktop 🤷.
            (tab.url.contains(text, ignoreCase = true) || tab.title.contains(text, ignoreCase = true)) &&
                resultsUrlFilter?.invoke(tab.url) != false
        }

        return results.sortedByDescending { it.lastUsed }.into()
    }

    /**
     * Expects list of BookmarkNode to be specifically of bookmarks (e.g. nodes with a url).
     */
    private suspend fun List<ClientTabPair>.into(): List<AwesomeBar.Suggestion> {
        val iconRequests = this.map { client ->
            client.tab.iconUrl?.let { iconUrl ->
                icons?.loadIcon(
                    IconRequest(url = iconUrl, waitOnNetworkLoad = false),
                )
            }
        }

        return this.zip(iconRequests) { result, icon ->
            AwesomeBar.Suggestion(
                provider = this@SyncedTabsStorageSuggestionProvider,
                icon = icon?.await()?.bitmap,
                indicatorIcon = when (result.deviceType) {
                    DeviceType.DESKTOP -> deviceIndicators.desktop
                    DeviceType.MOBILE -> deviceIndicators.mobile
                    DeviceType.TABLET -> deviceIndicators.tablet
                    else -> null
                },
                flags = setOf(Flag.SYNC_TAB),
                title = result.tab.title,
                description = result.clientName,
                onSuggestionClicked = {
                    loadUrlUseCase(result.tab.url)
                    emitSyncedTabSuggestionClickedFact()
                },
            )
        }
    }
}

/**
 * AwesomeBar suggestion indicators data class for desktop, mobile, tablet device types.
 */
data class DeviceIndicators(
    val desktop: Drawable? = null,
    val mobile: Drawable? = null,
    val tablet: Drawable? = null,
)
