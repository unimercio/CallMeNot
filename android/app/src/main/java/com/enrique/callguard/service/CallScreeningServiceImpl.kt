package com.enrique.callguard.service

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
                Log.e(TAG, "Error screening call: ${e.message}", e)
                // In case of error, let the call pass as a fallback so we don't block legitimate calls
                respondWithNoAction(callDetails)
            }
        }
    }

    private suspend fun handleScreening(callDetails: Call.Details, phoneNumber: String) {
        // Read configuration state
        val isEnabled = repository.isScreeningEnabled.first()
        if (!isEnabled) {
            Log.d(TAG, "Screening service is disabled in settings. Skipping.")
            respondWithNoAction(callDetails)
            return
        }

        val blockVerifiedSpam = repository.blockVerifiedSpam.first()
        val silenceUnknowns = repository.silenceUnknowns.first()
        val aggressiveMode = repository.aggressiveMode.first()

        // 1. Check Caller Number Verification Status (STIR/SHAKEN verification failed)
        // API Level 30+ has callerNumberVerificationStatus
        val verificationStatus = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION.SDK_INT) {
            callDetails.callerNumberVerificationStatus
        } else {
            Connection.VERIFICATION_STATUS_NOT_VERIFIED
        }

        // If verification failed and settings say block verified spam, reject immediately
        if (blockVerifiedSpam && verificationStatus == Connection.VERIFICATION_STATUS_FAILED) {
            Log.i(TAG, "Blocking call from $phoneNumber: STIR/SHAKEN Verification Failed")
            rejectCall(
                callDetails, 
                phoneNumber, 
                reason = "STIR/SHAKEN Verification Failed", 
                verificationStatus = verificationStatus
            )
            return
        }

        // 2. Check Local Blacklist
        if (repository.isBlacklisted(phoneNumber)) {
            Log.i(TAG, "Blocking call from $phoneNumber: Number is in local blacklist")
            rejectCall(
                callDetails, 
                phoneNumber, 
                reason = "In Blacklist Database", 
                verificationStatus = verificationStatus
            )
            return
        }

        // 3. Contact Existence Check (Are they in our address book?)
        val isInContacts = checkIfInContacts(applicationContext, phoneNumber)

        // 4. Aggressive Mode: Block all non-contacts
        if (aggressiveMode && !isInContacts) {
            Log.i(TAG, "Blocking call from $phoneNumber: Aggressive Mode (Non-Contact)")
            rejectCall(
                callDetails, 
                phoneNumber, 
                reason = "Aggressive Mode (Not in Contacts)", 
                verificationStatus = verificationStatus
            )
            return
        }

        // 5. Silence Unknowns Mode: Silence calls from non-contacts instead of rejecting
        if (silenceUnknowns && !isInContacts) {
            Log.i(TAG, "Silencing call from $phoneNumber: Unknown Number")
            silenceCall(
                callDetails, 
                phoneNumber, 
                reason = "Silence Unknowns Enabled", 
                verificationStatus = verificationStatus
            )
            return
        }

        // 6. Legitimate / Passed Call
        Log.i(TAG, "Letting call from $phoneNumber pass through normally")
        passCall(callDetails, phoneNumber, verificationStatus)
    }

    private suspend fun rejectCall(
        callDetails: Call.Details, 
        number: String, 
        reason: String, 
        verificationStatus: Int
    ) {
        // Save to logs
        repository.addCallLog(
            number = number,
            actionTaken = "REJECTED",
            reason = reason,
            verificationStatus = verificationStatus
        )

        // Build response to completely disallow, reject, and prevent ringing
        val response = CallResponse.Builder()
            .setDisallowCall(true)
            .setRejectCall(true)
            .setSkipCallLog(false)
            .setSkipNotification(false)
            .build()

        withContext(Dispatchers.Main) {
            respondToCall(callDetails, response)
        }
    }

    private suspend fun silenceCall(
        callDetails: Call.Details, 
        number: String, 
        reason: String, 
        verificationStatus: Int
    ) {
        repository.addCallLog(
            number = number,
            actionTaken = "SILENCED",
            reason = reason,
            verificationStatus = verificationStatus
        )

        // Silencing allows the call but won't trigger standard notification ringing sound
        val response = CallResponse.Builder()
            .setSilenceCall(true)
            .setDisallowCall(false) // Let standard CallLog log it, just quiet it
            .build()

        withContext(Dispatchers.Main) {
            respondToCall(callDetails, response)
        }
    }

    private suspend fun passCall(
        callDetails: Call.Details, 
        number: String, 
        verificationStatus: Int
    ) {
        repository.addCallLog(
            number = number,
            actionTaken = "PASSED",
            reason = "Legitimate Caller",
            verificationStatus = verificationStatus
        )

        // Empty response rings normally
        val response = CallResponse.Builder().build()
        withContext(Dispatchers.Main) {
            respondToCall(callDetails, response)
        }
    }

    private fun respondWithNoAction(callDetails: Call.Details) {
        val response = CallResponse.Builder().build()
        respondToCall(callDetails, response)
    }

    // Safely check contacts provider to see if number exists in address book
    private fun checkIfInContacts(context: Context, phoneNumber: String): Boolean {
        try {
            val contactUri = Uri.withAppendedPath(
                ContactsContract.PhoneLookup.CONTENT_FILTER_URI, 
                Uri.encode(phoneNumber)
            )
            val projection = arrayOf(ContactsContract.PhoneLookup.DISPLAY_NAME)
            val cursor: Cursor? = context.contentResolver.query(
                contactUri, 
                projection, 
                null, 
                null, 
                null
            )
            cursor.use {
                if (it != null && it.moveToFirst()) {
                    return true // Exists in contacts
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Contacts reading failed or permission not granted: ${e.message}")
        }
        return false
    }
}
