import React, { useState, useEffect, useMemo } from "react";
import { 
  Shield, 
  Ban, 
  List as ListIcon, 
  Settings as SettingsIcon, 
  Info, 
  PhoneCall, 
  Trash2, 
  Plus, 
  Search, 
  Smartphone, 
  VolumeX, 
  CheckCircle, 
  AlertTriangle, 
  Sparkles, 
  FileText, 
  Download, 
  Copy, 
  Check, 
  User, 
  PhoneOff, 
  Activity, 
  CornerDownRight, 
  Terminal,
  HelpCircle,
  Folder,
  ChevronRight,
  ShieldAlert,
  Sliders,
  LogOut,
  Moon
} from "lucide-react";

// Types for Simulator State
interface BlacklistItem {
  number: string;
  reason: string;
  createdAt: string;
}

interface ScreenedLog {
  id: number;
  number: string;
  actionTaken: "REJECTED" | "SILENCED" | "PASSED";
  reason: string;
  timestamp: string;
  verificationStatus: "PASSED" | "FAILED" | "UNVERIFIED";
}

// Full Android Source Code Map for Explorer
const SOURCE_CODE: Record<string, { path: string; language: string; content: string }> = {
  "AndroidManifest.xml": {
    path: "/android/app/src/main/AndroidManifest.xml",
    language: "xml",
    content: `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.enrique.callguard">

    <!-- Permissions required for reading phone state and call logs -->
    <uses-permission android:name="android.permission.READ_PHONE_STATE" />
    <uses-permission android:name="android.permission.READ_CALL_LOG" />
    <uses-permission android:name="android.permission.ANSWER_PHONE_CALLS" />
    
    <!-- Required to check if number is in contacts to differentiate known vs unknown -->
    <uses-permission android:name="android.permission.READ_CONTACTS" />

    <application
        android:allowBackup="true"
        android:icon="@android:drawable/ic_menu_shield"
        android:label="CallGuard"
        android:roundIcon="@android:drawable/ic_menu_shield"
        android:supportsRtl="true"
        android:theme="@android:style/Theme.DeviceDefault.NoActionBar">
        
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:label="CallGuard Screener"
            android:theme="@android:style/Theme.DeviceDefault.NoActionBar">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <!-- Registering CallScreeningService with the system.
             MUST be protected by android.permission.BIND_SCREENING_SERVICE.
             The system uses this service to screen incoming calls in real-time. -->
        <service
            android:name=".service.CallScreeningServiceImpl"
            android:permission="android.permission.BIND_SCREENING_SERVICE"
            android:exported="true">
            <intent-filter>
                <action android:name="android.telecom.CallScreeningService" />
            </intent-filter>
        </service>

    </application>
</manifest>`
  },
  "CallScreeningServiceImpl.kt": {
    path: "/android/app/src/main/java/com/enrique/callguard/service/CallScreeningServiceImpl.kt",
    language: "kotlin",
    content: `package com.enrique.callguard.service

import android.content.Context
import android.database.Cursor
import android.net.Uri
import android.provider.ContactsContract
import android.telecom.Call
import android.telecom.CallScreeningService
import android.telecom.Connection
import android.util.Log
import com.enrique.callguard.data.CallGuardRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class CallScreeningServiceImpl : CallScreeningService() {

    private val TAG = "CallGuardService"
    private lateinit var repository: CallGuardRepository

    override fun onCreate() {
        super.onCreate()
        repository = CallGuardRepository(applicationContext)
    }

    override fun onScreenCall(callDetails: Call.Details) {
        // Only screen incoming calls
        if (callDetails.callDirection != Call.Details.DIRECTION_INCOMING) {
            return
        }

        val rawUri = callDetails.handle
        val phoneNumber = rawUri?.schemeSpecificPart ?: ""
        
        if (phoneNumber.isEmpty()) {
            Log.w(TAG, "Empty phone number received, letting it pass.")
            respondWithNoAction(callDetails)
            return
        }

        // Run checking asynchronously to avoid blocking the main thread
        CoroutineScope(Dispatchers.IO).launch {
            try {
                handleScreening(callDetails, phoneNumber)
            } catch (e: Exception) {
                Log.e(TAG, "Error screening call: \${e.message}", e)
                respondWithNoAction(callDetails)
            }
        }
    }

    private suspend fun handleScreening(callDetails: Call.Details, phoneNumber: String) {
        // Read configuration state
        val isEnabled = repository.isScreeningEnabled.first()
        if (!isEnabled) {
            respondWithNoAction(callDetails)
            return
        }

        val blockVerifiedSpam = repository.blockVerifiedSpam.first()
        val silenceUnknowns = repository.silenceUnknowns.first()
        val aggressiveMode = repository.aggressiveMode.first()

        // Extract caller verification status (STIR/SHAKEN status)
        val verificationStatus = if (android.os.Build.VERSION.SDK_INT >= 30) {
            callDetails.callerNumberVerificationStatus
        } else {
            Connection.VERIFICATION_STATUS_NOT_VERIFIED
        }

        // 1. Block STIR/SHAKEN verification failed spam
        if (blockVerifiedSpam && verificationStatus == Connection.VERIFICATION_STATUS_FAILED) {
            rejectCall(callDetails, phoneNumber, "STIR/SHAKEN Verification Failed", verificationStatus)
            return
        }

        // 2. Check Local Room Blacklist database
        if (repository.isBlacklisted(phoneNumber)) {
            rejectCall(callDetails, phoneNumber, "In Blacklist Database", verificationStatus)
            return
        }

        // 3. Contact existence lookup
        val isInContacts = checkIfInContacts(applicationContext, phoneNumber)

        // 4. Aggressive Mode: Block all non-contacts
        if (aggressiveMode && !isInContacts) {
            rejectCall(callDetails, phoneNumber, "Aggressive Mode (Non-Contact)", verificationStatus)
            return
        }

        // 5. Silence Unknowns Mode: Silence calls from non-contacts instead of rejecting
        if (silenceUnknowns && !isInContacts) {
            silenceCall(callDetails, phoneNumber, "Silence Unknowns Enabled", verificationStatus)
            return
        }

        // 6. Legitimate / Passed Call
        passCall(callDetails, phoneNumber, verificationStatus)
    }

    private suspend fun rejectCall(callDetails: Call.Details, number: String, reason: String, verificationStatus: Int) {
        repository.addCallLog(number, "REJECTED", reason, verificationStatus)

        val response = CallResponse.Builder()
            .setDisallowCall(true)
            .setRejectCall(true)
            .setSkipCallLog(false)
            .setSkipNotification(false)
            .build()

        withContext(Dispatchers.Main) { respondToCall(callDetails, response) }
    }

    private suspend fun silenceCall(callDetails: Call.Details, number: String, reason: String, verificationStatus: Int) {
        repository.addCallLog(number, "SILENCED", reason, verificationStatus)

        val response = CallResponse.Builder()
            .setSilenceCall(true)
            .setDisallowCall(false)
            .build()

        withContext(Dispatchers.Main) { respondToCall(callDetails, response) }
    }

    private suspend fun passCall(callDetails: Call.Details, number: String, verificationStatus: Int) {
        repository.addCallLog(number, "PASSED", "Legitimate Caller", verificationStatus)
        val response = CallResponse.Builder().build()
        withContext(Dispatchers.Main) { respondToCall(callDetails, response) }
    }

    private fun respondWithNoAction(callDetails: Call.Details) {
        respondToCall(callDetails, CallResponse.Builder().build())
    }

    private fun checkIfInContacts(context: Context, phoneNumber: String): Boolean {
        try {
            val contactUri = Uri.withAppendedPath(ContactsContract.PhoneLookup.CONTENT_FILTER_URI, Uri.encode(phoneNumber))
            val projection = arrayOf(ContactsContract.PhoneLookup.DISPLAY_NAME)
            val cursor = context.contentResolver.query(contactUri, projection, null, null, null)
            cursor.use { if (it != null && it.moveToFirst()) return true }
        } catch (e: Exception) {
            Log.e(TAG, "Contacts permission not granted or check failed.")
        }
        return false
    }
}`
  },
  "CallGuardDatabase.kt": {
    path: "/android/app/src/main/java/com/enrique/callguard/data/CallGuardDatabase.kt",
    language: "kotlin",
    content: `package com.enrique.callguard.data

import android.content.Context
import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "blacklist")
data class BlacklistItem(
    @PrimaryKey val number: String,
    val reason: String = "Blocked Spam",
    val createdAt: Long = System.currentTimeMillis()
)

@Entity(tableName = "screened_call_logs")
data class ScreenedCallLog(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val number: String,
    val timestamp: Long = System.currentTimeMillis(),
    val actionTaken: String, // "REJECTED", "SILENCED", "PASSED"
    val reason: String,
    val verificationStatus: Int
)

@Dao
interface BlacklistDao {
    @Query("SELECT * FROM blacklist ORDER BY createdAt DESC")
    fun getAllFlow(): Flow<List<BlacklistItem>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(item: BlacklistItem)

    @Query("DELETE FROM blacklist WHERE number = :number")
    suspend fun deleteByNumber(number: String)
}

@Dao
interface CallLogDao {
    @Query("SELECT * FROM screened_call_logs ORDER BY timestamp DESC")
    fun getAllLogsFlow(): Flow<List<ScreenedCallLog>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(log: ScreenedCallLog)

    @Query("DELETE FROM screened_call_logs")
    suspend fun clearAll()
}

@Database(entities = [BlacklistItem::class, ScreenedCallLog::class], version = 1, exportSchema = false)
abstract class AppDatabase : RoomDatabase() {
    abstract fun blacklistDao(): BlacklistDao
    abstract fun callLogDao(): CallLogDao

    companion object {
        @Volatile private var INSTANCE: AppDatabase? = null
        fun getDatabase(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "call_guard_database"
                ).fallbackToDestructiveMigration().build()
                INSTANCE = instance
                instance
            }
        }
    }
}`
  },
  "CallGuardRepository.kt": {
    path: "/android/app/src/main/java/com/enrique/callguard/data/CallGuardRepository.kt",
    language: "kotlin",
    content: `package com.enrique.callguard.data

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.flow.*

class CallGuardRepository(private val context: Context) {
    private val database = AppDatabase.getDatabase(context)
    private val blacklistDao = database.blacklistDao()
    private val callLogDao = database.callLogDao()
    private val sharedPrefs = context.getSharedPreferences("call_guard_settings", Context.MODE_PRIVATE)

    companion object {
        const val KEY_SCREENING_ENABLED = "screening_enabled"
        const val KEY_BLOCK_VERIFIED_SPAM = "block_verified_spam"
        const val KEY_SILENCE_UNKNOWNS = "silence_unknowns"
        const val KEY_AGGRESSIVE_MODE = "aggressive_mode"
    }

    private val _isScreeningEnabled = MutableStateFlow(sharedPrefs.getBoolean(KEY_SCREENING_ENABLED, true))
    val isScreeningEnabled = _isScreeningEnabled.asStateFlow()

    private val _blockVerifiedSpam = MutableStateFlow(sharedPrefs.getBoolean(KEY_BLOCK_VERIFIED_SPAM, true))
    val blockVerifiedSpam = _blockVerifiedSpam.asStateFlow()

    private val _silenceUnknowns = MutableStateFlow(sharedPrefs.getBoolean(KEY_SILENCE_UNKNOWNS, false))
    val silenceUnknowns = _silenceUnknowns.asStateFlow()

    private val _aggressiveMode = MutableStateFlow(sharedPrefs.getBoolean(KEY_AGGRESSIVE_MODE, false))
    val aggressiveMode = _aggressiveMode.asStateFlow()

    val blacklistFlow = blacklistDao.getAllFlow()
    val callLogFlow = callLogDao.getAllLogsFlow()

    suspend fun addToBlacklist(number: String, reason: String) {
        blacklistDao.insert(BlacklistItem(normalizeNumber(number), reason))
    }

    suspend fun removeFromBlacklist(number: String) {
        blacklistDao.deleteByNumber(normalizeNumber(number))
    }

    suspend fun isBlacklisted(number: String): Boolean {
        val norm = normalizeNumber(number)
        return blacklistDao.findByNumber(norm) != null
    }

    suspend fun addCallLog(number: String, actionTaken: String, reason: String, verificationStatus: Int) {
        callLogDao.insert(ScreenedCallLog(number = number, actionTaken = actionTaken, reason = reason, verificationStatus = verificationStatus))
    }

    suspend fun clearCallLogs() = callLogDao.clearAll()

    fun setScreeningEnabled(v: Boolean) = sharedPrefs.edit().putBoolean(KEY_SCREENING_ENABLED, v).apply().also { _isScreeningEnabled.value = v }
    fun setBlockVerifiedSpam(v: Boolean) = sharedPrefs.edit().putBoolean(KEY_BLOCK_VERIFIED_SPAM, v).apply().also { _blockVerifiedSpam.value = v }
    fun setSilenceUnknowns(v: Boolean) = sharedPrefs.edit().putBoolean(KEY_SILENCE_UNKNOWNS, v).apply().also { _silenceUnknowns.value = v }
    fun setAggressiveMode(v: Boolean) = sharedPrefs.edit().putBoolean(KEY_AGGRESSIVE_MODE, v).apply().also { _aggressiveMode.value = v }

    fun normalizeNumber(n: String) = n.replace(Regex("[^0-9+]"), "")
}`
  },
  "CallGuardViewModel.kt": {
    path: "/android/app/src/main/java/com/enrique/callguard/ui/CallGuardViewModel.kt",
    language: "kotlin",
    content: `package com.enrique.callguard.ui

import androidx.lifecycle.*
import com.enrique.callguard.data.CallGuardRepository
import com.enrique.callguard.data.BlacklistItem
import com.enrique.callguard.data.ScreenedCallLog
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

class CallGuardViewModel(private val repository: CallGuardRepository) : ViewModel() {
    val blacklist = repository.blacklistFlow.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val callLogs = repository.callLogFlow.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val isScreeningEnabled = repository.isScreeningEnabled
    val blockVerifiedSpam = repository.blockVerifiedSpam
    val silenceUnknowns = repository.silenceUnknowns
    val aggressiveMode = repository.aggressiveMode

    fun toggleScreeningEnabled(v: Boolean) = repository.setScreeningEnabled(v)
    fun toggleBlockVerifiedSpam(v: Boolean) = repository.setBlockVerifiedSpam(v)
    fun toggleSilenceUnknowns(v: Boolean) = repository.setSilenceUnknowns(v)
    fun toggleAggressiveMode(v: Boolean) = repository.setAggressiveMode(v)

    fun addToBlacklist(number: String, reason: String) = viewModelScope.launch { repository.addToBlacklist(number, reason) }
    fun removeFromBlacklist(number: String) = viewModelScope.launch { repository.removeFromBlacklist(number) }
    fun clearCallLogs() = viewModelScope.launch { repository.clearCallLogs() }
}

class CallGuardViewModelFactory(private val r: CallGuardRepository) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T = CallGuardViewModel(r) as T
}`
  },
  "MainActivity.kt": {
    path: "/android/app/src/main/java/com/enrique/callguard/MainActivity.kt",
    language: "kotlin",
    content: `package com.enrique.callguard

import android.app.role.RoleManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.core.content.ContextCompat
import com.enrique.callguard.data.CallGuardRepository
import com.enrique.callguard.ui.CallGuardViewModel
import com.enrique.callguard.ui.CallGuardViewModelFactory
import com.enrique.callguard.ui.theme.CallGuardTheme
import com.enrique.callguard.ui.theme.DarkBackground
import com.enrique.callguard.ui.theme.DarkSurface

class MainActivity : ComponentActivity() {
    private lateinit var repository: CallGuardRepository

    private val requestRoleLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
        if (res.resultCode == RESULT_OK) Toast.makeText(this, "Active call screener!", Toast.LENGTH_SHORT).show()
    }

    private val requestPermissionsLauncher = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { p ->
        if (p[android.Manifest.permission.READ_PHONE_STATE] == true) Toast.makeText(this, "Ready", Toast.LENGTH_SHORT).show()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        repository = CallGuardRepository(applicationContext)

        setContent {
            CallGuardTheme {
                MainAppLayout(
                    repository = repository,
                    onRequestRole = { requestCallScreeningRole() },
                    onRequestPermissions = { requestAppPermissions() },
                    checkRoleGranted = { isRoleHeld() },
                    checkPermissionsGranted = { hasPermissions() }
                )
            }
        }
    }

    private fun isRoleHeld(): Boolean {
        return if (Build.VERSION.SDK_INT >= 29) {
            val rm = getSystemService(RoleManager::class.java)
            rm?.isRoleHeld(RoleManager.ROLE_CALL_SCREENING) ?: false
        } else true
    }

    private fun requestCallScreeningRole() {
        if (Build.VERSION.SDK_INT >= 29) {
            val rm = getSystemService(RoleManager::class.java)
            if (rm != null && !rm.isRoleHeld(RoleManager.ROLE_CALL_SCREENING)) {
                requestRoleLauncher.launch(rm.createRequestRoleIntent(RoleManager.ROLE_CALL_SCREENING))
            }
        }
    }

    private fun hasPermissions(): Boolean {
        return ContextCompat.checkSelfPermission(this, android.Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED
    }

    private fun requestAppPermissions() {
        requestPermissionsLauncher.launch(arrayOf(android.Manifest.permission.READ_PHONE_STATE, android.Manifest.permission.READ_CONTACTS))
    }
}`
  },
  "build.gradle.kts": {
    path: "/android/app/build.gradle.kts",
    language: "kotlin",
    content: `plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    id("kotlin-kapt")
}

android {
    namespace = "com.enrique.callguard"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.enrique.callguard"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildFeatures { compose = true }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.navigation.compose)

    // Room Database
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    kapt(libs.androidx.room.compiler)
}`
  }
};

export default function App() {
  // --- STATE FOR WEB EMULATOR AND LOGS ---
  const [activeTab, setActiveTab] = useState<"dashboard" | "blacklist" | "logs" | "settings" | "help">("dashboard");
  const [roleHeld, setRoleHeld] = useState(true);
  const [permissionsGranted, setPermissionsGranted] = useState(true);
  
  // App Toggles (Settings)
  const [screeningEnabled, setScreeningEnabled] = useState(true);
  const [blockVerifiedSpam, setBlockVerifiedSpam] = useState(true);
  const [silenceUnknowns, setSilenceUnknowns] = useState(false);
  const [aggressiveMode, setAggressiveMode] = useState(false);

  // Blacklist Data
  const [blacklist, setBlacklist] = useState<BlacklistItem[]>([
    { number: "+1 800-555-0192", reason: "IRS Tax Scammer", createdAt: "Jul 03, 2026" },
    { number: "+1 555-901-4433", reason: "Robocall Telemarketing", createdAt: "Jul 02, 2026" },
    { number: "+44 20 7946 0958", reason: "Spam Loan Offer", createdAt: "Jun 30, 2026" }
  ]);

  // Screened Call logs
  const [callLogs, setCallLogs] = useState<ScreenedLog[]>([
    { id: 1, number: "+1 800-555-0192", actionTaken: "REJECTED", reason: "In Blacklist Database", timestamp: "06:14 PM", verificationStatus: "FAILED" },
    { id: 2, number: "+1 555-234-8899", actionTaken: "PASSED", reason: "Legitimate Caller (In Contacts)", timestamp: "05:45 PM", verificationStatus: "PASSED" },
    { id: 3, number: "+1 888-444-2211", actionTaken: "SILENCED", reason: "Silence Unknowns Enabled", timestamp: "04:30 PM", verificationStatus: "UNVERIFIED" },
    { id: 4, number: "+1 555-111-2222", actionTaken: "PASSED", reason: "Legitimate Caller", timestamp: "02:15 PM", verificationStatus: "PASSED" }
  ]);

  // Add Blacklist States
  const [newNumber, setNewNumber] = useState("");
  const [newReason, setNewReason] = useState("");
  const [blacklistSearch, setBlacklistSearch] = useState("");
  const [isAddingToBlacklist, setIsAddingToBlacklist] = useState(false);

  // --- SOURCE EXPLORER STATE ---
  const [selectedFile, setSelectedFile] = useState<string>("CallScreeningServiceImpl.kt");
  const [copied, setCopied] = useState(false);

  // --- SIMULATION CONTROL STATE ---
  const [simPhoneNumber, setSimPhoneNumber] = useState("+1 555-888-0022");
  const [simInContacts, setSimInContacts] = useState(false);
  const [simVerification, setSimVerification] = useState<"PASSED" | "FAILED" | "UNVERIFIED">("UNVERIFIED");
  const [serviceLogs, setServiceLogs] = useState<string[]>([
    "System initialized. CallScreeningService listening on com.enrique.callguard...",
    "Local Room DB connected. Blacklist table ready."
  ]);
  const [isSimulatingCall, setIsSimulatingCall] = useState(false);
  const [simOutcome, setSimOutcome] = useState<{ action: string; reason: string } | null>(null);

  // --- STATISTICS COMPUTATIONS ---
  const stats = useMemo(() => {
    const rejected = callLogs.filter(l => l.actionTaken === "REJECTED").length;
    const silenced = callLogs.filter(l => l.actionTaken === "SILENCED").length;
    const passed = callLogs.filter(l => l.actionTaken === "PASSED").length;
    return {
      total: callLogs.length,
      rejected,
      silenced,
      passed
    };
  }, [callLogs]);

  // Add Log line helper
  const addLog = (line: string) => {
    setServiceLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${line}`]);
  };

  // Run the Call Screening Service simulation algorithm
  const triggerCallSimulation = () => {
    if (isSimulatingCall) return;
    
    setIsSimulatingCall(true);
    setSimOutcome(null);
    
    addLog(`Incoming Call Received: ${simPhoneNumber}`);
    addLog(`STIR/SHAKEN Verification status: ${simVerification}`);
    addLog(`Contacts search: ${simInContacts ? "FOUND in Address Book" : "NOT FOUND (Unknown)"}`);

    setTimeout(() => {
      // 1. Check general switch
      if (!screeningEnabled) {
        addLog("Outcome: PASSED (Service disabled by user)");
        setSimOutcome({ action: "PASSED", reason: "Call Screening Service is turned OFF in Settings" });
        setCallLogs(prev => [
          {
            id: Date.now(),
            number: simPhoneNumber,
            actionTaken: "PASSED",
            reason: "Screening Service Disabled",
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            verificationStatus: simVerification
          },
          ...prev
        ]);
        return;
      }

      // 2. STIR/SHAKEN Fail Check
      if (blockVerifiedSpam && simVerification === "FAILED") {
        addLog("Match: STIR/SHAKEN FAILED. Decision: REJECT");
        setSimOutcome({ action: "REJECTED", reason: "STIR/SHAKEN Verification Failed (High Spam Risk)" });
        setCallLogs(prev => [
          {
            id: Date.now(),
            number: simPhoneNumber,
            actionTaken: "REJECTED",
            reason: "STIR/SHAKEN Verification Failed",
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            verificationStatus: simVerification
          },
          ...prev
        ]);
        return;
      }

      // 3. Blacklist Match Check
      const isInBlacklist = blacklist.some(item => {
        const normItem = item.number.replace(/[^0-9]/g, "");
        const normSim = simPhoneNumber.replace(/[^0-9]/g, "");
        return normItem === normSim || normSim.includes(normItem) || normItem.includes(normSim);
      });

      if (isInBlacklist) {
        addLog("Match: Number found in local Room Blacklist table. Decision: REJECT");
        setSimOutcome({ action: "REJECTED", reason: "Number is in Local Room Database Blacklist" });
        setCallLogs(prev => [
          {
            id: Date.now(),
            number: simPhoneNumber,
            actionTaken: "REJECTED",
            reason: "In Blacklist Database",
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            verificationStatus: simVerification
          },
          ...prev
        ]);
        return;
      }

      // 4. Aggressive Mode (Block all non-contacts)
      if (aggressiveMode && !simInContacts) {
        addLog("Match: Aggressive Mode on & Not in Contacts. Decision: REJECT");
        setSimOutcome({ action: "REJECTED", reason: "Aggressive Block Mode (Not in Address Book)" });
        setCallLogs(prev => [
          {
            id: Date.now(),
            number: simPhoneNumber,
            actionTaken: "REJECTED",
            reason: "Aggressive Mode (Not in Contacts)",
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            verificationStatus: simVerification
          },
          ...prev
        ]);
        return;
      }

      // 5. Silence Unknowns
      if (silenceUnknowns && !simInContacts) {
        addLog("Match: Silence Unknowns on & Not in Contacts. Decision: SILENCE");
        setSimOutcome({ action: "SILENCED", reason: "Call silenced silently (Silence Unknowns Enabled)" });
        setCallLogs(prev => [
          {
            id: Date.now(),
            number: simPhoneNumber,
            actionTaken: "SILENCED",
            reason: "Silence Unknowns Enabled",
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            verificationStatus: simVerification
          },
          ...prev
        ]);
        return;
      }

      // 6. Legitimate Pass
      addLog("Match: Legitimate call. Decision: PASS (Let ring normally)");
      setSimOutcome({ action: "PASSED", reason: "Legitimate Caller (Ring Normally)" });
      setCallLogs(prev => [
        {
          id: Date.now(),
          number: simPhoneNumber,
          actionTaken: "PASSED",
          reason: simInContacts ? "Legitimate Caller (In Contacts)" : "Legitimate Unknown Caller",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          verificationStatus: simVerification
        },
        ...prev
      ]);

    }, 1500);
  };

  const finishSimulation = () => {
    setIsSimulatingCall(false);
    setSimOutcome(null);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(SOURCE_CODE[selectedFile].content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAddBlacklist = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNumber.trim()) return;
    setBlacklist(prev => [
      {
        number: newNumber.trim(),
        reason: newReason.trim() || "Manual Spam Entry",
        createdAt: "Jul 03, 2026"
      },
      ...prev
    ]);
    addLog(`Manually blacklisted number: ${newNumber}`);
    setNewNumber("");
    setNewReason("");
    setIsAddingToBlacklist(false);
  };

  const handleDeleteBlacklist = (num: string) => {
    setBlacklist(prev => prev.filter(item => item.number !== num));
    addLog(`Removed from blacklist: ${num}`);
  };

  const handleClearLogs = () => {
    setCallLogs([]);
    addLog("Screened Call logs database cleared.");
  };

  // Filtered blacklist search
  const filteredBlacklist = useMemo(() => {
    return blacklist.filter(item => 
      item.number.includes(blacklistSearch) || 
      item.reason.toLowerCase().includes(blacklistSearch.toLowerCase())
    );
  }, [blacklist, blacklistSearch]);

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 font-sans">
      {/* HEADER BAR */}
      <header className="border-b border-slate-800 bg-[#0B1222]/90 backdrop-blur-md sticky top-0 z-50 px-8 py-5">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                CallGuard Screener
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">
                  Android Native Codebase & Simulator
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Production-ready Kotlin (Jetpack Compose + Room + CallScreeningService) SDK 35
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <a 
              href="#code-explorer"
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold flex items-center gap-2 shadow-lg shadow-blue-500/10 transition-colors cursor-pointer"
            >
              <FileText className="h-4 w-4" />
              Browse Kotlin Source
            </a>
          </div>
        </div>
      </header>

      {/* CORE GRID LAYOUT */}
      <main className="max-w-7xl mx-auto px-8 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* LEFT COLUMN: INTERACTIVE ANDROID EMULATOR (Col-span 5) */}
        <div className="lg:col-span-5 flex flex-col items-center justify-start">
          <div className="text-center mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-blue-400 flex items-center justify-center gap-2">
              <Smartphone className="h-4 w-4" /> Live Device Emulator
            </h2>
            <p className="text-xs text-slate-400">Click UI tabs below to interact with the simulated App state</p>
          </div>

          {/* PHONE CONTAINER WRAPPER */}
          <div className="relative w-[340px] h-[680px] bg-[#0B1222] rounded-[48px] p-3 shadow-2xl border-4 border-slate-800 shadow-blue-500/5 flex flex-col select-none overflow-hidden">
            {/* Speaker & Camera Notch */}
            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 w-32 h-6 bg-black rounded-full z-30 flex items-center justify-center gap-2">
              <div className="w-12 h-1 bg-zinc-800 rounded-full"></div>
              <div className="w-3 h-3 bg-zinc-900 rounded-full border border-zinc-800"></div>
            </div>

            {/* SCREEN CANVAS */}
            <div className="w-full h-full bg-[#0F172A] rounded-[38px] flex flex-col justify-between overflow-hidden relative border border-slate-800">
              
              {/* Phone Status Bar */}
              <div className="pt-8 px-5 pb-2 flex justify-between items-center text-[10px] text-slate-400 font-semibold z-20">
                <span>18:11</span>
                <div className="flex items-center gap-1.5">
                  <Shield className="h-3 w-3 text-emerald-400" />
                  <span>LTE</span>
                  <div className="w-5 h-2.5 bg-slate-700 rounded-sm p-0.5 flex items-center">
                    <div className="w-full h-full bg-emerald-400 rounded-2xs"></div>
                  </div>
                </div>
              </div>

              {/* INCOMING CALL SCREEN OVERLAY */}
              {isSimulatingCall && (
                <div className="absolute inset-0 bg-[#0F172A]/95 z-40 flex flex-col justify-between p-8 pt-20 animate-fade-in">
                  <div className="text-center space-y-4">
                    <div className="relative inline-block">
                      <div className="h-20 w-20 rounded-full bg-blue-600/10 border-2 border-blue-500/20 flex items-center justify-center mx-auto animate-pulse">
                        <PhoneCall className="h-10 w-10 text-blue-400" />
                      </div>
                      {simVerification === "FAILED" && (
                        <span className="absolute -top-1 -right-1 bg-red-500 text-white p-1 rounded-full border border-slate-950">
                          <ShieldAlert className="h-4 w-4" />
                        </span>
                      )}
                    </div>
                    
                    <div className="space-y-1">
                      <h3 className="text-xl font-bold text-white">{simPhoneNumber}</h3>
                      <p className="text-xs text-blue-400 font-medium tracking-wider uppercase">
                        {simInContacts ? "Contact: Saved" : "Unknown Number"}
                      </p>
                    </div>

                    {/* verification badges */}
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs">
                      {simVerification === "PASSED" && (
                        <>
                          <CheckCircle className="h-3 w-3 text-emerald-400" />
                          <span className="text-emerald-400 font-medium">STIR/SHAKEN: Verified Caller</span>
                        </>
                      )}
                      {simVerification === "FAILED" && (
                        <>
                          <AlertTriangle className="h-3 w-3 text-red-400" />
                          <span className="text-red-400 font-medium">STIR/SHAKEN: VERIFICATION FAILED</span>
                        </>
                      )}
                      {simVerification === "UNVERIFIED" && (
                        <>
                          <HelpCircle className="h-3 w-3 text-amber-400" />
                          <span className="text-slate-400">STIR/SHAKEN: Unverified Identity</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Processing / Result Area */}
                  <div className="bg-slate-900/50 rounded-2xl p-4 border border-slate-800 text-center space-y-3">
                    {!simOutcome ? (
                      <div className="space-y-2">
                        <div className="flex justify-center gap-1">
                          <span className="h-2 w-2 rounded-full bg-blue-400 animate-bounce"></span>
                          <span className="h-2 w-2 rounded-full bg-blue-400 animate-bounce [animation-delay:0.2s]"></span>
                          <span className="h-2 w-2 rounded-full bg-blue-400 animate-bounce [animation-delay:0.4s]"></span>
                        </div>
                        <p className="text-xs text-slate-400">CallScreeningService screening call details...</p>
                      </div>
                    ) : (
                      <div className="space-y-2 animate-fade-in">
                        <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Decision Outcome</p>
                        <div className={`text-sm font-bold ${
                          simOutcome.action === "REJECTED" ? "text-red-400" :
                          simOutcome.action === "SILENCED" ? "text-amber-400" : "text-emerald-400"
                        }`}>
                          {simOutcome.action}
                        </div>
                        <p className="text-[11px] text-slate-300">{simOutcome.reason}</p>
                        
                        <button 
                          onClick={finishSimulation}
                          className="mt-2 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
                        >
                          Dismiss Overlay
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Reject / Accept graphical layout */}
                  <div className="flex justify-around items-center">
                    <div className="flex flex-col items-center gap-1">
                      <div className="h-12 w-12 rounded-full bg-red-600 flex items-center justify-center text-white">
                        <PhoneOff className="h-5 w-5" />
                      </div>
                      <span className="text-[10px] text-slate-400">Reject</span>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <div className="h-12 w-12 rounded-full bg-emerald-600 flex items-center justify-center text-white">
                        <PhoneCall className="h-5 w-5" />
                      </div>
                      <span className="text-[10px] text-slate-400">Accept</span>
                    </div>
                  </div>
                </div>
              )}

              {/* PHONE SCREEN CONTENT */}
              <div className="flex-1 overflow-y-auto px-5 py-2 scrollbar-none">
                
                {/* VIEW 1: DASHBOARD */}
                {activeTab === "dashboard" && (
                  <div className="space-y-4 animate-fade-in text-left">
                    <div className="flex justify-between items-center">
                      <h3 className="text-lg font-extrabold text-white">CallGuard</h3>
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping"></span>
                    </div>

                    {/* Active Protection State Shield */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-center relative overflow-hidden">
                      <div className={`mx-auto h-16 w-16 rounded-full flex items-center justify-center mb-3 ${
                        screeningEnabled ? "bg-green-500/10 border border-green-500/20 text-green-400" : "bg-red-500/10 border border-red-500/20 text-red-400"
                      }`}>
                        <Shield className="h-8 w-8" />
                      </div>
                      <h4 className="text-sm font-bold text-white uppercase tracking-wide">
                        {screeningEnabled ? "Shield Guard Active" : "Shield Suspended"}
                      </h4>
                      <p className="text-[10px] text-slate-400 mt-1 max-w-[200px] mx-auto">
                        {screeningEnabled ? "Intercepting unknown calls on SQLite database matches" : "Enable screening to prevent spam ringing"}
                      </p>
                    </div>

                    {/* Quick Statistics Counters */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
                        <div className="text-[9px] text-red-400 uppercase font-bold tracking-wider">Blocked</div>
                        <div className="text-lg font-bold text-white mt-1">{stats.rejected}</div>
                      </div>
                      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
                        <div className="text-[9px] text-amber-400 uppercase font-bold tracking-wider">Silenced</div>
                        <div className="text-lg font-bold text-white mt-1">{stats.silenced}</div>
                      </div>
                      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
                        <div className="text-[9px] text-emerald-400 uppercase font-bold tracking-wider">Passed</div>
                        <div className="text-lg font-bold text-white mt-1">{stats.passed}</div>
                      </div>
                    </div>

                    {/* Total Intercept Banner */}
                    <div className="bg-gradient-to-r from-blue-950 to-slate-900 border border-blue-900/30 rounded-xl p-3 flex justify-between items-center">
                      <div>
                        <h5 className="text-[11px] font-bold text-slate-300">Total Intercepts</h5>
                        <p className="text-[9px] text-slate-400">Saved phone distractions</p>
                      </div>
                      <span className="text-2xl font-black text-blue-400">{stats.total}</span>
                    </div>

                    {/* Info Card */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex gap-2 items-start">
                      <Sparkles className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <h6 className="text-[11px] font-bold text-white">Privacy Guarantee</h6>
                        <p className="text-[9px] text-slate-400 leading-snug">Room DB database remains completely localized. No data is harvested.</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* VIEW 2: BLACKLIST DATABASE */}
                {activeTab === "blacklist" && (
                  <div className="space-y-3 animate-fade-in text-left">
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="text-base font-extrabold text-white">Local Blacklist</h3>
                        <p className="text-[10px] text-slate-400">Room SQLite Persistent Table</p>
                      </div>
                      <button 
                        onClick={() => setIsAddingToBlacklist(true)}
                        className="p-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Search Field */}
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2 h-3 w-3 text-slate-400" />
                      <input 
                        type="text" 
                        placeholder="Search blacklisted..." 
                        value={blacklistSearch}
                        onChange={(e) => setBlacklistSearch(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    {/* Interactive Form Inline if adding */}
                    {isAddingToBlacklist && (
                      <form onSubmit={handleAddBlacklist} className="bg-slate-900 border border-blue-500/20 p-3 rounded-xl space-y-2.5 animate-slide-up">
                        <h4 className="text-[11px] font-bold text-blue-400">Add New Number</h4>
                        <input 
                          type="text" 
                          required 
                          placeholder="Number (e.g. +1 555-2233)" 
                          value={newNumber}
                          onChange={(e) => setNewNumber(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-md px-2 py-1 text-xs text-white placeholder-slate-500 focus:outline-none"
                        />
                        <input 
                          type="text" 
                          placeholder="Reason (e.g. Scam Spammer)" 
                          value={newReason}
                          onChange={(e) => setNewReason(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-md px-2 py-1 text-xs text-white placeholder-slate-500 focus:outline-none"
                        />
                        <div className="flex justify-end gap-2 pt-1">
                          <button 
                            type="button" 
                            onClick={() => setIsAddingToBlacklist(false)}
                            className="px-2.5 py-1 rounded bg-slate-800 text-slate-400 text-[10px]"
                          >
                            Cancel
                          </button>
                          <button 
                            type="submit" 
                            className="px-3 py-1 rounded bg-blue-600 text-white text-[10px] font-bold"
                          >
                            Save DB
                          </button>
                        </div>
                      </form>
                    )}

                    {/* Blacklist Items rendering */}
                    <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                      {filteredBlacklist.map((item, idx) => (
                        <div 
                          key={idx} 
                          className="bg-slate-900 border border-slate-800 rounded-xl p-2.5 flex justify-between items-center"
                        >
                          <div>
                            <div className="text-xs font-bold text-white">{item.number}</div>
                            <div className="text-[9px] text-slate-400 mt-0.5">{item.reason}</div>
                          </div>
                          <button 
                            onClick={() => handleDeleteBlacklist(item.number)}
                            className="p-1 hover:bg-red-500/10 text-red-400 rounded-md transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                      {filteredBlacklist.length === 0 && (
                        <div className="text-center py-8 text-xs text-slate-500">No matching numbers.</div>
                      )}
                    </div>
                  </div>
                )}

                {/* VIEW 3: CALL HISTORY LOGS */}
                {activeTab === "logs" && (
                  <div className="space-y-3 animate-fade-in text-left">
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="text-base font-extrabold text-white">Call Logs</h3>
                        <p className="text-[10px] text-slate-400">Screening activity log (Room DB)</p>
                      </div>
                      {callLogs.length > 0 && (
                        <button 
                          onClick={handleClearLogs}
                          className="p-1 text-red-400 hover:bg-red-500/10 rounded-md"
                          title="Clear database logs"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                      {callLogs.map((log) => {
                        const inBlacklist = blacklist.some(b => b.number === log.number);
                        return (
                          <div key={log.id} className="bg-slate-900 border border-slate-800 rounded-xl p-2.5 flex justify-between items-center gap-2">
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold text-white">{log.number}</span>
                                <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded-full ${
                                  log.actionTaken === "REJECTED" ? "bg-red-500/15 text-red-400 border border-red-500/20" :
                                  log.actionTaken === "SILENCED" ? "bg-amber-500/15 text-amber-400 border border-amber-500/20" :
                                  "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                                }`}>
                                  {log.actionTaken}
                                </span>
                              </div>
                              <p className="text-[9px] text-slate-400">{log.reason}</p>
                              <p className="text-[8px] text-slate-500">{log.timestamp}</p>
                            </div>

                            {log.actionTaken !== "REJECTED" && !inBlacklist && (
                              <button
                                onClick={() => {
                                  setBlacklist(prev => [
                                    { number: log.number, reason: "Spam reported via Logs", createdAt: "Jul 03, 2026" },
                                    ...prev
                                  ]);
                                  addLog(`Blacklisted from Call Log shortcut: ${log.number}`);
                                }}
                                className="p-1.5 bg-red-950/40 text-red-400 hover:bg-red-950 rounded-lg border border-red-900/30"
                                title="Block this number"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                      {callLogs.length === 0 && (
                        <div className="text-center py-12 text-xs text-slate-500 flex flex-col items-center gap-2">
                          <CheckCircle className="h-8 w-8 text-emerald-400/50" />
                          No screened calls logged.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* VIEW 4: SETTINGS */}
                {activeTab === "settings" && (
                  <div className="space-y-4 animate-fade-in text-left">
                    <div>
                      <h3 className="text-base font-extrabold text-white">Screener Rules</h3>
                      <p className="text-[10px] text-slate-400">Settings Flow triggers</p>
                    </div>

                    <div className="space-y-3">
                      {/* Toggle 1: Global Screening */}
                      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
                        <div className="max-w-[190px]">
                          <div className="text-xs font-bold text-white">Screening Service</div>
                          <p className="text-[9px] text-slate-400 mt-0.5">Intercept, match database blacklist, and screen calls</p>
                        </div>
                        <button 
                          onClick={() => {
                            setScreeningEnabled(!screeningEnabled);
                            addLog(`Screening Enabled toggled to: ${!screeningEnabled}`);
                          }}
                          className={`w-10 h-6 rounded-full p-1 transition-colors duration-200 ${screeningEnabled ? "bg-blue-600" : "bg-slate-700"}`}
                        >
                          <div className={`w-4 h-4 bg-white rounded-full transition-transform duration-200 ${screeningEnabled ? "translate-x-4" : ""}`}></div>
                        </button>
                      </div>

                      {/* Toggle 2: Block Verified Spam */}
                      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
                        <div className="max-w-[190px]">
                          <div className="text-xs font-bold text-white">Block Verified Spam</div>
                          <p className="text-[9px] text-slate-400 mt-0.5">Auto-reject calls if STIR/SHAKEN validation FAILS</p>
                        </div>
                        <button 
                          onClick={() => {
                            setBlockVerifiedSpam(!blockVerifiedSpam);
                            addLog(`Block Verified Spam toggled: ${!blockVerifiedSpam}`);
                          }}
                          className={`w-10 h-6 rounded-full p-1 transition-colors duration-200 ${blockVerifiedSpam ? "bg-blue-600" : "bg-slate-700"}`}
                        >
                          <div className={`w-4 h-4 bg-white rounded-full transition-transform duration-200 ${blockVerifiedSpam ? "translate-x-4" : ""}`}></div>
                        </button>
                      </div>

                      {/* Toggle 3: Silence Unknowns */}
                      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
                        <div className="max-w-[190px]">
                          <div className="text-xs font-bold text-white">Silence Unknown Numbers</div>
                          <p className="text-[9px] text-slate-400 mt-0.5">Quiet ringtone for calls from numbers not in contacts</p>
                        </div>
                        <button 
                          onClick={() => {
                            if (aggressiveMode) return;
                            setSilenceUnknowns(!silenceUnknowns);
                            addLog(`Silence Unknowns toggled to: ${!silenceUnknowns}`);
                          }}
                          className={`w-10 h-6 rounded-full p-1 transition-colors duration-200 ${aggressiveMode ? "bg-slate-800 cursor-not-allowed opacity-50" : silenceUnknowns ? "bg-blue-600" : "bg-slate-700"}`}
                        >
                          <div className={`w-4 h-4 bg-white rounded-full transition-transform duration-200 ${silenceUnknowns && !aggressiveMode ? "translate-x-4" : ""}`}></div>
                        </button>
                      </div>

                      {/* Toggle 4: Aggressive Block Mode */}
                      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
                        <div className="max-w-[190px]">
                          <div className="text-xs font-bold text-red-400">Aggressive Block Mode</div>
                          <p className="text-[9px] text-slate-400 mt-0.5">Instantly block ANY incoming call not in contacts book</p>
                        </div>
                        <button 
                          onClick={() => {
                            const val = !aggressiveMode;
                            setAggressiveMode(val);
                            if (val) {
                               setSilenceUnknowns(false); // Aggressive overrides simple silent
                            }
                            addLog(`Aggressive Block Mode toggled to: ${val}`);
                          }}
                          className={`w-10 h-6 rounded-full p-1 transition-colors duration-200 ${aggressiveMode ? "bg-red-500" : "bg-slate-700"}`}
                        >
                          <div className={`w-4 h-4 bg-white rounded-full transition-transform duration-200 ${aggressiveMode ? "translate-x-4" : ""}`}></div>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* VIEW 5: HELP & GUIDES */}
                {activeTab === "help" && (
                  <div className="space-y-4 animate-fade-in text-left">
                    <div>
                      <h3 className="text-base font-extrabold text-white">Setup Checklist</h3>
                      <p className="text-[10px] text-slate-400">Essential configuration steps</p>
                    </div>

                    <div className="space-y-3 text-[11px] text-slate-300">
                      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-1">
                        <div className="flex gap-2 items-center">
                          <span className="h-5 w-5 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-[10px]">1</span>
                          <span className="font-bold text-white">Grant Core Permissions</span>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-snug pl-7">CallGuard requires READ_PHONE_STATE and READ_CONTACTS to match callers with contacts.</p>
                      </div>

                      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-1">
                        <div className="flex gap-2 items-center">
                          <span className="h-5 w-5 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-[10px]">2</span>
                          <span className="font-bold text-white">Register Default Role</span>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-snug pl-7">Android requires registering the app as the default screening agent before it can drop unwanted connections.</p>
                      </div>

                      <div className="bg-slate-900 border border-emerald-900/30 rounded-xl p-3 bg-emerald-950/10">
                        <h4 className="font-bold text-emerald-400 mb-1">Local Room Database</h4>
                        <p className="text-[10px] text-slate-400 leading-snug">All database logs, blacklists, and configurations remain 100% offline. Zero network permission is declared in the manifest.</p>
                      </div>
                    </div>
                  </div>
                )}

              </div>

              {/* Phone Bottom Navigation Bar */}
              <div className="border-t border-slate-800 bg-slate-900 px-4 py-3 flex justify-between items-center z-20">
                <button 
                  onClick={() => setActiveTab("dashboard")} 
                  className={`flex flex-col items-center gap-1 flex-1 transition-colors ${activeTab === "dashboard" ? "text-blue-400" : "text-slate-500 hover:text-slate-400"}`}
                >
                  <Shield className="h-4.5 w-4.5" />
                  <span className="text-[8px] font-medium">Dashboard</span>
                </button>
                
                <button 
                  onClick={() => setActiveTab("blacklist")} 
                  className={`flex flex-col items-center gap-1 flex-1 transition-colors ${activeTab === "blacklist" ? "text-blue-400" : "text-slate-500 hover:text-slate-400"}`}
                >
                  <Ban className="h-4.5 w-4.5" />
                  <span className="text-[8px] font-medium">Blacklist</span>
                </button>

                <button 
                  onClick={() => setActiveTab("logs")} 
                  className={`flex flex-col items-center gap-1 flex-1 transition-colors ${activeTab === "logs" ? "text-blue-400" : "text-slate-500 hover:text-slate-400"}`}
                >
                  <ListIcon className="h-4.5 w-4.5" />
                  <span className="text-[8px] font-medium">Logs</span>
                </button>

                <button 
                  onClick={() => setActiveTab("settings")} 
                  className={`flex flex-col items-center gap-1 flex-1 transition-colors ${activeTab === "settings" ? "text-blue-400" : "text-slate-500 hover:text-slate-400"}`}
                >
                  <SettingsIcon className="h-4.5 w-4.5" />
                  <span className="text-[8px] font-medium">Settings</span>
                </button>

                <button 
                  onClick={() => setActiveTab("help")} 
                  className={`flex flex-col items-center gap-1 flex-1 transition-colors ${activeTab === "help" ? "text-blue-400" : "text-slate-500 hover:text-slate-400"}`}
                >
                  <Info className="h-4.5 w-4.5" />
                  <span className="text-[8px] font-medium">Help</span>
                </button>
              </div>

              {/* Android Pill Navigation Bar */}
              <div className="pb-2 flex justify-center z-20 bg-slate-900">
                <div className="w-20 h-1 bg-slate-500 rounded-full"></div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: SIMULATOR TRIGGER PANEL & CODE EXPLORER (Col-span 7) */}
        <div className="lg:col-span-7 space-y-6 flex flex-col justify-start">
          
          {/* ACTION PANEL: INCOMING CALL SIMULATOR CONTROLS */}
          <div className="bg-[#0B1222] border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <PhoneCall className="h-5 w-5 text-blue-400" />
               <h2 className="text-base font-bold text-white">Call Screening Trigger Panel</h2>
            </div>
            <p className="text-xs text-slate-400 leading-snug">
              Set custom caller details and run the CallScreeningService check algorithm. You will see live decision processing in the phone mockup and system logs!
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              {/* Caller number input */}
              <div className="space-y-1.5 text-left">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Caller Number</label>
                <input 
                  type="text" 
                  value={simPhoneNumber}
                  onChange={(e) => setSimPhoneNumber(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Verification Status */}
              <div className="space-y-1.5 text-left">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">STIR/SHAKEN Status</label>
                <select 
                  value={simVerification}
                  onChange={(e) => setSimVerification(e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="PASSED">PASSED (Identity Verified)</option>
                  <option value="UNVERIFIED">UNVERIFIED (No Caller ID Cert)</option>
                  <option value="FAILED">FAILED (Spoofed/Spam Number)</option>
                </select>
              </div>

              {/* Contacts Book status */}
              <div className="space-y-1.5 text-left">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Saved Contact</label>
                <select 
                  value={simInContacts ? "yes" : "no"}
                  onChange={(e) => setSimInContacts(e.target.value === "yes")}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="no">No (Unknown Caller)</option>
                  <option value="yes">Yes (Is in Address Book)</option>
                </select>
              </div>
            </div>

            {/* Simulated preset quick shortcuts */}
            <div className="flex flex-wrap gap-2 items-center pt-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Spam Presets:</span>
              <button 
                onClick={() => {
                  setSimPhoneNumber("+1 800-555-0192");
                  setSimInContacts(false);
                  setSimVerification("UNVERIFIED");
                }}
                className="px-2 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs rounded text-slate-300"
              >
                In Blacklist DB
              </button>
              <button 
                onClick={() => {
                  setSimPhoneNumber("+1 555-901-4433");
                  setSimInContacts(false);
                  setSimVerification("FAILED");
                }}
                className="px-2 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs rounded text-slate-300"
              >
                Spoofed Caller (FAILED ID)
              </button>
              <button 
                onClick={() => {
                  setSimPhoneNumber("+1 555-401-2091");
                  setSimInContacts(true);
                  setSimVerification("PASSED");
                }}
                className="px-2 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs rounded text-slate-300"
              >
                Trusted Contact
              </button>
            </div>

            {/* Simulate Call Button */}
            <button 
              onClick={triggerCallSimulation}
              disabled={isSimulatingCall}
              className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-blue-500/10"
            >
              <PhoneCall className="h-4.5 w-4.5 text-white" />
              {isSimulatingCall ? "Checking screening algorithms..." : "Simulate Incoming Phone Call"}
            </button>

            {/* Service terminal output */}
            <div className="space-y-1.5 text-left pt-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Terminal className="h-3.5 w-3.5 text-blue-400" /> Live Service Logs
                </label>
                <button 
                  onClick={() => setServiceLogs([`[${new Date().toLocaleTimeString()}] Logs cleared. Service listening...`])}
                  className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
                >
                  Clear logs
                </button>
              </div>
              <div className="bg-black/80 rounded-xl p-3 h-32 overflow-y-auto font-mono text-[11px] text-emerald-400 space-y-1 scrollbar-thin border border-slate-900 select-text">
                {serviceLogs.map((log, index) => (
                  <div key={index} className="flex gap-1">
                    <span className="text-emerald-600 shrink-0 select-none">❯</span>
                    <span className="leading-snug">{log}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* CODEBASE VIEW EXPLORER */}
          <div id="code-explorer" className="bg-[#0B1222] border border-slate-800 rounded-2xl overflow-hidden flex flex-col text-left">
            <div className="p-5 border-b border-slate-800 bg-slate-900/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Folder className="h-5 w-5 text-blue-400" />
                <div>
                  <h3 className="text-sm font-bold text-white">Kotlin Codebase Explorer</h3>
                  <p className="text-xs text-slate-400">View production-ready Android files generated in local repository</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2 self-stretch sm:self-auto">
                <button 
                  onClick={handleCopyCode}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-700"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copy File</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* FILE SELECTION TABS */}
            <div className="px-5 py-2 border-b border-slate-800 bg-slate-900/50 flex gap-2 overflow-x-auto scrollbar-thin whitespace-nowrap">
              {Object.keys(SOURCE_CODE).map((filename) => (
                <button
                  key={filename}
                  onClick={() => setSelectedFile(filename)}
                  className={`px-3 py-1.5 rounded-md text-xs font-mono transition-colors cursor-pointer flex items-center gap-1.5 ${
                    selectedFile === filename 
                      ? "bg-blue-600/10 text-blue-300 border border-blue-500/30" 
                      : "text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent"
                  }`}
                >
                  <FileText className="h-3 w-3 shrink-0" />
                  {filename}
                </button>
              ))}
            </div>

            {/* PREVIEW CONTAINER */}
            <div className="relative flex-1">
              {/* Path metadata */}
              <div className="px-5 py-1.5 bg-black/40 text-[10px] text-slate-500 font-mono flex items-center gap-1 border-b border-slate-900 select-text">
                <CornerDownRight className="h-3 w-3 text-blue-500" />
                <span>{SOURCE_CODE[selectedFile].path}</span>
              </div>

              {/* Actual Code block formatted as code */}
              <pre className="p-5 font-mono text-[11px] leading-relaxed text-slate-300 overflow-x-auto max-h-[380px] bg-slate-950 select-text">
                <code>{SOURCE_CODE[selectedFile].content}</code>
              </pre>
            </div>
          </div>

        </div>
      </main>

      {/* FOOTER INSTRUCTIONS */}
      <footer className="border-t border-slate-800 bg-[#0B1222] py-8 px-6 mt-12 text-center text-slate-400">
        <div className="max-w-7xl mx-auto space-y-4">
          <div className="flex items-center justify-center gap-2">
            <Shield className="h-5 w-5 text-blue-400" />
            <span className="font-semibold text-white">CallGuard Screener Workspace</span>
          </div>
          <p className="text-xs max-w-2xl mx-auto leading-relaxed">
            The full workspace of this native Android application has been generated and structure-compiled inside the <code className="text-blue-400 bg-slate-950 px-1 py-0.5 rounded font-mono">/android/</code> directory of your current session container. You can immediately export this project to standard GitHub or ZIP using the <strong>AI Studio App Settings</strong> menu to open in <strong>Android Studio Koala/Ladybug+</strong> and compile to a signed release APK.
          </p>
          <div className="text-[10px] text-slate-600 font-mono">
            Target SDK 35 • Minimum SDK 26 • Jetpack Compose 1.10 • Room SQLite 2.6
          </div>
        </div>
      </footer>
    </div>
  );
}
