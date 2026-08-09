package com.enrique.callguard.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.enrique.callguard.data.CallGuardRepository
import com.enrique.callguard.data.BlacklistItem
import com.enrique.callguard.data.ScreenedCallLog
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class CallGuardViewModel(private val repository: CallGuardRepository) : ViewModel() {

    val blacklist: StateFlow<List<BlacklistItem>> = repository.blacklistFlow
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val callLogs: StateFlow<List<ScreenedCallLog>> = repository.callLogFlow
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val isScreeningEnabled: StateFlow<Boolean> = repository.isScreeningEnabled
    val blockVerifiedSpam: StateFlow<Boolean> = repository.blockVerifiedSpam
    val silenceUnknowns: StateFlow<Boolean> = repository.silenceUnknowns
    val aggressiveMode: StateFlow<Boolean> = repository.aggressiveMode

    fun toggleScreeningEnabled(enabled: Boolean) {
        repository.setScreeningEnabled(enabled)
    }

    fun toggleBlockVerifiedSpam(enabled: Boolean) {
        repository.setBlockVerifiedSpam(enabled)
    }

    fun toggleSilenceUnknowns(enabled: Boolean) {
        repository.setSilenceUnknowns(enabled)
    }

    fun toggleAggressiveMode(enabled: Boolean) {
        repository.setAggressiveMode(enabled)
    }

    fun addToBlacklist(number: String, reason: String) {
        viewModelScope.launch {
            repository.addToBlacklist(number, reason)
        }
    }

    fun removeFromBlacklist(number: String) {
        viewModelScope.launch {
            repository.removeFromBlacklist(number)
        }
    }

    fun clearCallLogs() {
        viewModelScope.launch {
            repository.clearCallLogs()
        }
    }

    val totalBlockedCount: StateFlow<Int> = repository.callLogFlow
        .map { list -> list.count { it.actionTaken == "REJECTED" } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0)
}

class CallGuardViewModelFactory(private val repository: CallGuardRepository) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(CallGuardViewModel::class.java)) {
            @Suppress("UNCHECKED_CAST")
            return CallGuardViewModel(repository) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class")
    }
}
