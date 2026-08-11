package com.enrique.callguard.data

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class CallGuardRepository(private val context: Context) {

    private val database = AppDatabase.getDatabase(context)
    private val blacklistDao = database.blacklistDao()
    private val callLogDao = database.callLogDao()

    private val sharedPrefs: SharedPreferences = context.getSharedPreferences(
        "call_guard_settings",
        Context.MODE_PRIVATE
    )

    companion object {
        const val KEY_SCREENING_ENABLED = "screening_enabled"
        const val KEY_BLOCK_VERIFIED_SPAM = "block_verified_spam"
        const val KEY_SILENCE_UNKNOWNS = "silence_unknowns"
        const val KEY_AGGRESSIVE_MODE = "aggressive_mode"
    }

    private val _isScreeningEnabled = MutableStateFlow(sharedPrefs.getBoolean(KEY_SCREENING_ENABLED, true))
    val isScreeningEnabled: StateFlow<Boolean> = _isScreeningEnabled.asStateFlow()

    private val _blockVerifiedSpam = MutableStateFlow(sharedPrefs.getBoolean(KEY_BLOCK_VERIFIED_SPAM, true))
    val blockVerifiedSpam: StateFlow<Boolean> = _blockVerifiedSpam.asStateFlow()

    private val _silenceUnknowns = MutableStateFlow(sharedPrefs.getBoolean(KEY_SILENCE_UNKNOWNS, false))
    val silenceUnknowns: StateFlow<Boolean> = _silenceUnknowns.asStateFlow()

    private val _aggressiveMode = MutableStateFlow(sharedPrefs.getBoolean(KEY_AGGRESSIVE_MODE, false))
    val aggressiveMode: StateFlow<Boolean> = _aggressiveMode.asStateFlow()

    val blacklistFlow: Flow<List<BlacklistItem>> = blacklistDao.getAllFlow()
    val callLogFlow: Flow<List<ScreenedCallLog>> = callLogDao.getAllLogsFlow()

    suspend fun getBlacklist(): List<BlacklistItem> = blacklistDao.getAll()

    suspend fun addToBlacklist(number: String, reason: String) {
        val normalizedNumber = normalizeNumber(number)
        blacklistDao.insert(BlacklistItem(number = normalizedNumber, reason = reason))
    }

    suspend fun removeFromBlacklist(number: String) {
        val normalizedNumber = normalizeNumber(number)
        blacklistDao.deleteByNumber(normalizedNumber)
    }

    suspend fun isBlacklisted(number: String): Boolean {
        val normalizedNumber = normalizeNumber(number)
        return blacklistDao.findByNumber(normalizedNumber) != null ||
               blacklistDao.findByNumber(number) != null
    }

    suspend fun addCallLog(
        number: String,
        actionTaken: String,
        reason: String,
        verificationStatus: Int,
        decisionLatencyMs: Long = 0,
        isInContacts: Boolean? = null,
        bypassReason: String? = null,
        responseSent: Boolean = true
    ) {
        callLogDao.insert(
            ScreenedCallLog(
                number = number,
                actionTaken = actionTaken,
                reason = reason,
                verificationStatus = verificationStatus,
                decisionLatencyMs = decisionLatencyMs,
                isInContacts = isInContacts,
                bypassReason = bypassReason,
                responseSent = responseSent
            )
        )
    }

    suspend fun setCallVerdict(id: Long, verdict: String?) {
        require(verdict == null || verdict in setOf("SPAM", "LEGITIMATE", "UNSURE"))
        callLogDao.setUserVerdict(id, verdict)
    }

    suspend fun clearCallLogs() {
        callLogDao.clearAll()
    }

    fun setScreeningEnabled(enabled: Boolean) {
        sharedPrefs.edit().putBoolean(KEY_SCREENING_ENABLED, enabled).apply()
        _isScreeningEnabled.value = enabled
    }

    fun setBlockVerifiedSpam(enabled: Boolean) {
        sharedPrefs.edit().putBoolean(KEY_BLOCK_VERIFIED_SPAM, enabled).apply()
        _blockVerifiedSpam.value = enabled
    }

    fun setSilenceUnknowns(enabled: Boolean) {
        sharedPrefs.edit().putBoolean(KEY_SILENCE_UNKNOWNS, enabled).apply()
        _silenceUnknowns.value = enabled
    }

    fun setAggressiveMode(enabled: Boolean) {
        sharedPrefs.edit().putBoolean(KEY_AGGRESSIVE_MODE, enabled).apply()
        _aggressiveMode.value = enabled
    }

    fun normalizeNumber(number: String): String {
        return number.replace(Regex("[^0-9+]"), "")
    }
}
