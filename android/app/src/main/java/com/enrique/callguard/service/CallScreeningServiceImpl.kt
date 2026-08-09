package com.enrique.callguard.service

import android.content.Context
import android.database.Cursor
import android.net.Uri
import android.os.Build
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
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
            callDetails.callDirection != Call.Details.DIRECTION_INCOMING
        ) {
            return
        }

        val rawUri = callDetails.handle
        val phoneNumber = rawUri?.schemeSpecificPart ?: ""

        if (phoneNumber.isEmpty()) {
            Log.w(TAG, "Empty phone number received, letting it pass.")
            respondWithNoAction(callDetails)
            return
        }

        CoroutineScope(Dispatchers.IO).launch {
            try {
                handleScreening(callDetails, phoneNumber)
            } catch (e: Exception) {
                Log.e(TAG, "Error screening call: ${e.message}", e)
                withContext(Dispatchers.Main) {
                    respondWithNoAction(callDetails)
                }
            }
        }
    }

    private suspend fun handleScreening(callDetails: Call.Details, phoneNumber: String) {
        val isEnabled = repository.isScreeningEnabled.first()
        if (!isEnabled) {
            Log.d(TAG, "Screening service is disabled in settings. Skipping.")
            withContext(Dispatchers.Main) {
                respondWithNoAction(callDetails)
            }
            return
        }

        val blockVerifiedSpam = repository.blockVerifiedSpam.first()
        val silenceUnknowns = repository.silenceUnknowns.first()
        val aggressiveMode = repository.aggressiveMode.first()

        val verificationStatus = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            callDetails.callerNumberVerificationStatus
        } else {
            Connection.VERIFICATION_STATUS_NOT_VERIFIED
        }

        if (blockVerifiedSpam && verificationStatus == Connection.VERIFICATION_STATUS_FAILED) {
            Log.i(TAG, "Blocking call from $phoneNumber: STIR/SHAKEN Verification Failed")
            rejectCall(callDetails, phoneNumber, "STIR/SHAKEN Verification Failed", verificationStatus)
            return
        }

        if (repository.isBlacklisted(phoneNumber)) {
            Log.i(TAG, "Blocking call from $phoneNumber: Number is in local blacklist")
            rejectCall(callDetails, phoneNumber, "In Blacklist Database", verificationStatus)
            return
        }

        val isInContacts = checkIfInContacts(applicationContext, phoneNumber)

        if (aggressiveMode && !isInContacts) {
            Log.i(TAG, "Blocking call from $phoneNumber: Aggressive Mode (Non-Contact)")
            rejectCall(callDetails, phoneNumber, "Aggressive Mode (Not in Contacts)", verificationStatus)
            return
        }

        if (silenceUnknowns && !isInContacts) {
            Log.i(TAG, "Silencing call from $phoneNumber: Unknown Number")
            silenceCall(callDetails, phoneNumber, "Silence Unknowns Enabled", verificationStatus)
            return
        }

        Log.i(TAG, "Letting call from $phoneNumber pass through normally")
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

        withContext(Dispatchers.Main) {
            respondToCall(callDetails, response)
        }
    }

    private suspend fun silenceCall(callDetails: Call.Details, number: String, reason: String, verificationStatus: Int) {
        repository.addCallLog(number, "SILENCED", reason, verificationStatus)

        val response = CallResponse.Builder()
            .setSilenceCall(true)
            .setDisallowCall(false)
            .build()

        withContext(Dispatchers.Main) {
            respondToCall(callDetails, response)
        }
    }

    private suspend fun passCall(callDetails: Call.Details, number: String, verificationStatus: Int) {
        repository.addCallLog(number, "PASSED", "Legitimate Caller", verificationStatus)

        val response = CallResponse.Builder().build()
        withContext(Dispatchers.Main) {
            respondToCall(callDetails, response)
        }
    }

    private fun respondWithNoAction(callDetails: Call.Details) {
        respondToCall(callDetails, CallResponse.Builder().build())
    }

    private fun checkIfInContacts(context: Context, phoneNumber: String): Boolean {
        try {
            val contactUri = Uri.withAppendedPath(
                ContactsContract.PhoneLookup.CONTENT_FILTER_URI,
                Uri.encode(phoneNumber)
            )
            val projection = arrayOf(ContactsContract.PhoneLookup.DISPLAY_NAME)
            val cursor: Cursor? = context.contentResolver.query(contactUri, projection, null, null, null)
            cursor.use {
                if (it != null && it.moveToFirst()) {
                    return true
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Contacts reading failed or permission not granted: ${e.message}")
        }
        return false
    }
}
