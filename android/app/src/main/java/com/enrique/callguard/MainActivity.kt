package com.enrique.callguard

import android.app.role.RoleManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.CallLog
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.viewmodel.compose.viewModel
import com.enrique.callguard.data.CallGuardRepository
import com.enrique.callguard.data.BlacklistItem
import com.enrique.callguard.data.ScreenedCallLog
import com.enrique.callguard.ui.CallGuardViewModel
import com.enrique.callguard.ui.CallGuardViewModelFactory
import com.enrique.callguard.ui.theme.*
import java.text.SimpleDateFormat
import java.util.*

class MainActivity : ComponentActivity() {

    private lateinit var repository: CallGuardRepository

    // Handle Role Manager request for Call Screening
    private val requestRoleLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == RESULT_OK) {
            Toast.makeText(this, "CallGuard is now your active Call Screener!", Toast.LENGTH_SHORT).show()
        } else {
            Toast.makeText(this, "Screener role is required for automated spam block.", Toast.LENGTH_LONG).show()
        }
    }

    // Handle runtime permissions
    private val requestPermissionsLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val stateGranted = permissions[android.Manifest.permission.READ_PHONE_STATE] ?: false
        val contactsGranted = permissions[android.Manifest.permission.READ_CONTACTS] ?: false
        val logsGranted = permissions[android.Manifest.permission.READ_CALL_LOG] ?: false
        
        if (stateGranted && contactsGranted) {
            Toast.makeText(this, "Permissions authorized.", Toast.LENGTH_SHORT).show()
        } else {
            Toast.makeText(this, "Core permissions required to match contacts and read status.", Toast.LENGTH_LONG).show()
        }
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
                    checkRoleGranted = { isRoleGranted() },
                    checkPermissionsGranted = { hasRequiredPermissions() }
                )
            }
        }

        // Auto request permission on first launch if not granted
        if (!hasRequiredPermissions()) {
            requestAppPermissions()
        }
    }

    private fun isRoleGranted(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val roleManager = getSystemService(RoleManager::class.java)
            roleManager?.isRoleHeld(RoleManager.ROLE_CALL_SCREENING) ?: false
        } else {
            true // Below Q, standard CallScreeningService does not require RoleManager
        }
    }

    private fun requestCallScreeningRole() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val roleManager = getSystemService(RoleManager::class.java)
            if (roleManager != null && !roleManager.isRoleHeld(RoleManager.ROLE_CALL_SCREENING)) {
                val intent = roleManager.createRequestRoleIntent(RoleManager.ROLE_CALL_SCREENING)
                requestRoleLauncher.launch(intent)
            } else {
                Toast.makeText(this, "Call Screening Role already held!", Toast.LENGTH_SHORT).show()
            }
        } else {
            Toast.makeText(this, "Automatic role request not needed on this Android version.", Toast.LENGTH_SHORT).show()
        }
    }

    private fun hasRequiredPermissions(): Boolean {
        val statePermission = ContextCompat.checkSelfPermission(this, android.Manifest.permission.READ_PHONE_STATE)
        val contactsPermission = ContextCompat.checkSelfPermission(this, android.Manifest.permission.READ_CONTACTS)
        val logsPermission = ContextCompat.checkSelfPermission(this, android.Manifest.permission.READ_CALL_LOG)
        return statePermission == PackageManager.PERMISSION_GRANTED &&
               contactsPermission == PackageManager.PERMISSION_GRANTED &&
               logsPermission == PackageManager.PERMISSION_GRANTED
    }

    private fun requestAppPermissions() {
        requestPermissionsLauncher.launch(
            arrayOf(
                android.Manifest.permission.READ_PHONE_STATE,
                android.Manifest.permission.READ_CONTACTS,
                android.Manifest.permission.READ_CALL_LOG
            )
        )
    }
}

// ==========================================
// JETPACK COMPOSE MAIN LAYOUT
// ==========================================

@Composable
fun MainAppLayout(
    repository: CallGuardRepository,
    onRequestRole: () -> Unit,
    onRequestPermissions: () -> Unit,
    checkRoleGranted: () -> Boolean,
    checkPermissionsGranted: () -> Boolean
) {
    val viewModel: CallGuardViewModel = viewModel(factory = CallGuardViewModelFactory(repository))
    
    var currentTab by remember { mutableStateOf("dashboard") }
    var roleActive by remember { mutableStateOf(checkRoleGranted()) }
    var permissionsActive by remember { mutableStateOf(checkPermissionsGranted()) }

    // Periodically update active statuses
    LaunchedEffect(Unit) {
        while (true) {
            roleActive = checkRoleGranted()
            permissionsActive = checkPermissionsGranted()
            kotlinx.coroutines.delay(2000)
        }
    }

    Scaffold(
        bottomBar = {
            NavigationBar(
                containerColor = DarkSurface,
                tonalElevation = 8.dp
            ) {
                val tabs = listOf(
                    Triple("dashboard", "Dashboard", Icons.Default.Shield),
                    Triple("blacklist", "Blacklist", Icons.Default.Block),
                    Triple("logs", "Logs", Icons.Default.List),
                    Triple("settings", "Settings", Icons.Default.Settings),
                    Triple("help", "Help", Icons.Default.Info)
                )
                tabs.forEach { (tabId, label, icon) ->
                    NavigationBarItem(
                        selected = currentTab == tabId,
                        onClick = { currentTab = tabId },
                        label = { Text(label, fontSize = 10.sp) },
                        icon = { Icon(icon, contentDescription = label) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = AccentLight,
                            selectedTextColor = AccentLight,
                            unselectedIconColor = MutedText,
                            unselectedTextColor = MutedText,
                            indicatorColor = AccentColor.copy(alpha = 0.2f)
                        )
                    )
                }
            }
        },
        containerColor = DarkBackground
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            when (currentTab) {
                "dashboard" -> DashboardScreen(viewModel, roleActive, permissionsActive, onRequestRole, onRequestPermissions)
                "blacklist" -> BlacklistScreen(viewModel)
                "logs" -> CallLogScreen(viewModel)
                "settings" -> SettingsScreen(viewModel)
                "help" -> HelpScreen(viewModel, onRequestRole)
            }
        }
    }
}

// ==========================================
// TAB 1: DASHBOARD COMPOSABLE
// ==========================================

@Composable
fun DashboardScreen(
    viewModel: CallGuardViewModel,
    roleActive: Boolean,
    permissionsActive: Boolean,
    onRequestRole: () -> Unit,
    onRequestPermissions: () -> Unit
) {
    val logs by viewModel.callLogs.collectAsState()
    val isEnabled by viewModel.isScreeningEnabled.collectAsState()

    val totalCalls = logs.size
    val blockedCalls = logs.count { it.actionTaken == "REJECTED" }
    val silencedCalls = logs.count { it.actionTaken == "SILENCED" }
    val passedCalls = logs.count { it.actionTaken == "PASSED" }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            Text(
                text = "CallGuard Dashboard",
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                color = LightText
            )
        }

        // Status banner
        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = DarkSurface),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Box(
                        modifier = Modifier
                            .size(72.dp)
                            .clip(RoundedCornerShape(36.dp))
                            .background(
                                if (isEnabled && roleActive && permissionsActive) 
                                    GuardTeal.copy(alpha = 0.15f) 
                                else GuardRed.copy(alpha = 0.15f)
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = if (isEnabled && roleActive && permissionsActive) Icons.Default.Security else Icons.Default.GppBad,
                            contentDescription = "Shield Status",
                            tint = if (isEnabled && roleActive && permissionsActive) GuardTeal else GuardRed,
                            modifier = Modifier.size(40.dp)
                        )
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    Text(
                        text = if (isEnabled && roleActive && permissionsActive) "PROTECTION ACTIVE" else "ATTENTION REQUIRED",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (isEnabled && roleActive && permissionsActive) GuardTeal else GuardRed
                    )

                    Spacer(modifier = Modifier.height(4.dp))

                    Text(
                        text = if (!isEnabled) "Call screening is currently turned OFF"
                               else if (!roleActive) "App is not set as Default Spam & Call Screener"
                               else if (!permissionsActive) "Required permissions are missing"
                               else "Screener actively filtering spam in real-time",
                        fontSize = 13.sp,
                        color = MutedText,
                        textAlign = TextAlign.Center
                    )

                    if (!roleActive || !permissionsActive || !isEnabled) {
                        Spacer(modifier = Modifier.height(16.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            if (!roleActive) {
                                Button(
                                    onClick = onRequestRole,
                                    colors = ButtonDefaults.buttonColors(containerColor = AccentColor)
                                ) {
                                    Text("Set Default Screener", fontSize = 12.sp)
                                }
                            }
                            if (!permissionsActive) {
                                Button(
                                    onClick = onRequestPermissions,
                                    colors = ButtonDefaults.buttonColors(containerColor = AccentColor)
                                ) {
                                    Text("Grant Permissions", fontSize = 12.sp)
                                }
                            }
                        }
                    }
                }
            }
        }

        // Stats Counter Grid
        item {
            Text("Screening Statistics", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = LightText)
        }

        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // Blocked Card
                Card(
                    colors = CardDefaults.cardColors(containerColor = DarkSurface),
                    modifier = Modifier.weight(1f)
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(Icons.Default.Block, contentDescription = "Blocked", tint = GuardRed)
                        Spacer(modifier = Modifier.height(8.dp))
                        Text("Blocked", fontSize = 12.sp, color = MutedText)
                        Text(blockedCalls.toString(), fontSize = 24.sp, fontWeight = FontWeight.Bold, color = GuardRed)
                    }
                }

                // Silenced Card
                Card(
                    colors = CardDefaults.cardColors(containerColor = DarkSurface),
                    modifier = Modifier.weight(1f)
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(Icons.Default.VolumeMute, contentDescription = "Silenced", tint = GuardAmber)
                        Spacer(modifier = Modifier.height(8.dp))
                        Text("Silenced", fontSize = 12.sp, color = MutedText)
                        Text(silencedCalls.toString(), fontSize = 24.sp, fontWeight = FontWeight.Bold, color = GuardAmber)
                    }
                }

                // Passed Card
                Card(
                    colors = CardDefaults.cardColors(containerColor = DarkSurface),
                    modifier = Modifier.weight(1f)
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(Icons.Default.CheckCircle, contentDescription = "Passed", tint = GuardTeal)
                        Spacer(modifier = Modifier.height(8.dp))
                        Text("Passed", fontSize = 12.sp, color = MutedText)
                        Text(passedCalls.toString(), fontSize = 24.sp, fontWeight = FontWeight.Bold, color = GuardTeal)
                    }
                }
            }
        }

        // Total calls checked
        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = DarkSurface),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.padding(16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text("Total Calls Intercepted", fontSize = 14.sp, fontWeight = FontWeight.Medium, color = LightText)
                        Text("Since installation", fontSize = 11.sp, color = MutedText)
                    }
                    Text(
                        text = totalCalls.toString(),
                        fontSize = 32.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = AccentLight
                    )
                }
            }
        }

        // Quick Tips
        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = DarkSurface),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Default.Lightbulb, contentDescription = "Tip", tint = Color.Yellow, modifier = Modifier.size(32.dp))
                    Spacer(modifier = Modifier.width(16.dp))
                    Column {
                        Text("Pro Tip", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = LightText)
                        Text("Enable STIR/SHAKEN verification block in Settings to auto-reject spoofed calls.", fontSize = 11.sp, color = MutedText)
                    }
                }
            }
        }
    }
}

// ==========================================
// TAB 2: BLACKLIST SCREEN
// ==========================================

@Composable
fun BlacklistScreen(viewModel: CallGuardViewModel) {
    val blacklist by viewModel.blacklist.collectAsState()
    
    var numberInput by remember { mutableStateOf("") }
    var reasonInput by remember { mutableStateOf("") }
    var searchInput by remember { mutableStateOf("") }
    var showAddDialog by remember { mutableStateOf(false) }

    val filteredList = blacklist.filter {
        it.number.contains(searchInput) || it.reason.lowercase().contains(searchInput.lowercase())
    }

    Scaffold(
        floatingActionButton = {
            FloatingActionButton(
                onClick = { showAddDialog = true },
                containerColor = AccentColor,
                contentColor = Color.White
            ) {
                Icon(Icons.Default.Add, contentDescription = "Add Number")
            }
        },
        containerColor = DarkBackground
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(16.dp)
        ) {
            Text(
                text = "Blacklist Database",
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                color = LightText
            )
            Text(
                text = "Numbers here are auto-rejected without ringing.",
                fontSize = 12.sp,
                color = MutedText,
                modifier = Modifier.padding(bottom = 16.dp)
            )

            // Search Bar
            OutlinedTextField(
                value = searchInput,
                onValueChange = { searchInput = it },
                label = { Text("Search blacklist...") },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = "Search") },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 16.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = AccentLight,
                    unfocusedBorderColor = MutedText,
                    focusedLabelColor = AccentLight,
                    unfocusedLabelColor = MutedText
                ),
                singleLine = true
            )

            if (filteredList.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(Icons.Default.Block, contentDescription = "Empty", tint = MutedText, modifier = Modifier.size(64.dp))
                        Spacer(modifier = Modifier.height(12.dp))
                        Text(
                            text = if (searchInput.isEmpty()) "Blacklist is empty." else "No matches found.",
                            fontSize = 14.sp,
                            color = MutedText
                        )
                    }
                }
            } else {
                LazyColumn(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(filteredList) { item ->
                        Card(
                            colors = CardDefaults.cardColors(containerColor = DarkSurface),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(12.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column {
                                    Text(
                                        text = item.number,
                                        fontSize = 16.sp,
                                        fontWeight = FontWeight.SemiBold,
                                        color = LightText
                                    )
                                    Text(
                                        text = item.reason,
                                        fontSize = 12.sp,
                                        color = MutedText
                                    )
                                }
                                IconButton(onClick = { viewModel.removeFromBlacklist(item.number) }) {
                                    Icon(
                                        imageVector = Icons.Default.Delete,
                                        contentDescription = "Delete",
                                        tint = GuardRed
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        // Add Number Dialog
        if (showAddDialog) {
            AlertDialog(
                onDismissRequest = { showAddDialog = false },
                title = { Text("Add Blacklist Number") },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        OutlinedTextField(
                            value = numberInput,
                            onValueChange = { numberInput = it },
                            label = { Text("Phone Number") },
                            placeholder = { Text("e.g., +15551234567") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                        OutlinedTextField(
                            value = reasonInput,
                            onValueChange = { reasonInput = it },
                            label = { Text("Reason / Notes") },
                            placeholder = { Text("e.g., Telemarketing Spam") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                },
                confirmButton = {
                    Button(
                        onClick = {
                            if (numberInput.isNotBlank()) {
                                viewModel.addToBlacklist(
                                    numberInput.trim(),
                                    if (reasonInput.isBlank()) "Blocked Spam" else reasonInput.trim()
                                )
                                numberInput = ""
                                reasonInput = ""
                                showAddDialog = false
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = AccentColor)
                    ) {
                        Text("Add")
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showAddDialog = false }) {
                        Text("Cancel")
                    }
                },
                containerColor = DarkSurface
            )
        }
    }
}

// ==========================================
// TAB 3: SCREENED CALL LOG COMPOSABLE
// ==========================================

@Composable
fun CallLogScreen(viewModel: CallGuardViewModel) {
    val logs by viewModel.callLogs.collectAsState()
    val blacklist by viewModel.blacklist.collectAsState()
    
    val blacklistNumbers = remember(blacklist) { blacklist.map { it.number }.toSet() }
    val formatter = remember { SimpleDateFormat("MMM dd, yyyy - hh:mm a", Locale.getDefault()) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = "Screened Call Logs",
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                    color = LightText
                )
                Text(
                    text = "History of screened incoming activity",
                    fontSize = 12.sp,
                    color = MutedText
                )
            }
            if (logs.isNotEmpty()) {
                IconButton(onClick = { viewModel.clearCallLogs() }) {
                    Icon(Icons.Default.DeleteSweep, contentDescription = "Clear All Logs", tint = GuardRed)
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        if (logs.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Default.PhoneCallback, contentDescription = "Empty Log", tint = MutedText, modifier = Modifier.size(64.dp))
                    Spacer(modifier = Modifier.height(12.dp))
                    Text("No calls screened yet.", fontSize = 14.sp, color = MutedText)
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(logs) { log ->
                    Card(
                        colors = CardDefaults.cardColors(containerColor = DarkSurface),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(12.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(
                                        text = log.number,
                                        fontSize = 15.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = LightText
                                    )
                                    Spacer(modifier = Modifier.width(8.dp))
                                    
                                    // Action badge
                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(4.dp))
                                            .background(
                                                when (log.actionTaken) {
                                                    "REJECTED" -> GuardRed.copy(alpha = 0.15f)
                                                    "SILENCED" -> GuardAmber.copy(alpha = 0.15f)
                                                    else -> GuardTeal.copy(alpha = 0.15f)
                                                }
                                            )
                                            .padding(horizontal = 6.dp, vertical = 2.dp)
                                    ) {
                                        Text(
                                            text = log.actionTaken,
                                            fontSize = 9.sp,
                                            fontWeight = FontWeight.ExtraBold,
                                            color = when (log.actionTaken) {
                                                "REJECTED" -> GuardRed
                                                "SILENCED" -> GuardAmber
                                                else -> GuardTeal
                                            }
                                        )
                                    }
                                }
                                
                                Spacer(modifier = Modifier.height(4.dp))
                                
                                Text(
                                    text = log.reason,
                                    fontSize = 12.sp,
                                    color = LightText.copy(alpha = 0.8f)
                                )
                                Text(
                                    text = formatter.format(Date(log.timestamp)),
                                    fontSize = 10.sp,
                                    color = MutedText
                                )
                            }

                            // Block shortcut button if not already in blacklist
                            if (log.actionTaken != "REJECTED" && !blacklistNumbers.contains(log.number)) {
                                IconButton(
                                    onClick = { viewModel.addToBlacklist(log.number, "Blocked from Screened Logs") }
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Block,
                                        contentDescription = "Add to Blacklist",
                                        tint = GuardRed,
                                        modifier = Modifier.size(20.dp)
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

// ==========================================
// TAB 4: SETTINGS SCREEN
// ==========================================

@Composable
fun SettingsScreen(viewModel: CallGuardViewModel) {
    val isEnabled by viewModel.isScreeningEnabled.collectAsState()
    val blockSpam by viewModel.blockVerifiedSpam.collectAsState()
    val silenceUnknowns by viewModel.silenceUnknowns.collectAsState()
    val aggressiveMode by viewModel.aggressiveMode.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text(
            text = "Guard Settings",
            fontSize = 24.sp,
            fontWeight = FontWeight.Bold,
            color = LightText
        )

        Card(
            colors = CardDefaults.cardColors(containerColor = DarkSurface),
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("Core Filter Toggle", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = AccentLight)
                Spacer(modifier = Modifier.height(12.dp))
                
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Enable Call Screening", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = LightText)
                        Text("Actively intercept and screen incoming numbers", fontSize = 12.sp, color = MutedText)
                    }
                    Switch(
                        checked = isEnabled,
                        onCheckedChange = { viewModel.toggleScreeningEnabled(it) },
                        colors = SwitchDefaults.colors(checkedThumbColor = AccentLight)
                    )
                }
            }
        }

        Card(
            colors = CardDefaults.cardColors(containerColor = DarkSurface),
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Text("Anti-Spam Controls", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = AccentLight)

                // 1. Block STIR/SHAKEN failed verification
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Block Verified Spam", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = LightText)
                        Text("Block calls that FAIL Android ID verification (STIR/SHAKEN status)", fontSize = 11.sp, color = MutedText)
                    }
                    Switch(
                        checked = blockSpam,
                        enabled = isEnabled,
                        onCheckedChange = { viewModel.toggleBlockVerifiedSpam(it) },
                        colors = SwitchDefaults.colors(checkedThumbColor = AccentLight)
                    )
                }

                Divider(color = MutedText.copy(alpha = 0.2f))

                // 2. Silence Unknown numbers
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Silence Unknown Numbers", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = LightText)
                        Text("Silence calls from numbers not in your contacts", fontSize = 11.sp, color = MutedText)
                    }
                    Switch(
                        checked = silenceUnknowns,
                        enabled = isEnabled && !aggressiveMode, // Aggressive overrides silencing
                        onCheckedChange = { viewModel.toggleSilenceUnknowns(it) },
                        colors = SwitchDefaults.colors(checkedThumbColor = AccentLight)
                    )
                }

                Divider(color = MutedText.copy(alpha = 0.2f))

                // 3. Aggressive Mode (Block non-contacts completely)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Aggressive Block Mode", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = GuardRed)
                        Text("Instantly reject ALL calls from numbers not in your contacts database", fontSize = 11.sp, color = MutedText)
                    }
                    Switch(
                        checked = aggressiveMode,
                        enabled = isEnabled,
                        onCheckedChange = { 
                            viewModel.toggleAggressiveMode(it)
                            if (it) {
                                viewModel.toggleSilenceUnknowns(false) // Disable quiet mode since it blocks completely now
                            }
                        },
                        colors = SwitchDefaults.colors(checkedThumbColor = GuardRed)
                    )
                }
            }
        }
    }
}

// ==========================================
// TAB 5: HELP & ONBOARDING COMPOSABLE
// ==========================================

@Composable
fun HelpScreen(viewModel: CallGuardViewModel, onRequestRole: () -> Unit) {
    val isEnabled by viewModel.isScreeningEnabled.collectAsState()

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            Text(
                text = "Onboarding & Help Guide",
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                color = LightText
            )
        }

        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = DarkSurface),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("How CallGuard Works", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = AccentLight)
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "CallGuard integrates directly with the Android Telecom Framework. When a call is received, the operating system invokes our background screening service to check the caller identity before showing an incoming call screen.",
                        fontSize = 12.sp,
                        color = MutedText
                    )
                }
            }
        }

        item {
            Text("Essential Setup Checklist", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = LightText)
        }

        // Step 1
        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = DarkSurface),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(modifier = Modifier.padding(16.dp)) {
                    Box(
                        modifier = Modifier
                            .size(28.dp)
                            .clip(RoundedCornerShape(14.dp))
                            .background(AccentColor),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("1", color = Color.White, fontWeight = FontWeight.Bold)
                    }
                    Spacer(modifier = Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Grant Caller Permissions", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = LightText)
                        Text("CallGuard needs permission to read the caller ID, check status, and cross-reference contacts.", fontSize = 11.sp, color = MutedText)
                    }
                }
            }
        }

        // Step 2
        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = DarkSurface),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(modifier = Modifier.padding(16.dp)) {
                    Box(
                        modifier = Modifier
                            .size(28.dp)
                            .clip(RoundedCornerShape(14.dp))
                            .background(AccentColor),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("2", color = Color.White, fontWeight = FontWeight.Bold)
                    }
                    Spacer(modifier = Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Set as Default Screening App", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = LightText)
                        Text("Android requires CallGuard to be registered as your active Spam and Screening assistant to reject spam.", fontSize = 11.sp, color = MutedText)
                        Spacer(modifier = Modifier.height(8.dp))
                        Button(
                            onClick = onRequestRole,
                            colors = ButtonDefaults.buttonColors(containerColor = AccentColor)
                        ) {
                            Text("Request Screening Role", fontSize = 11.sp)
                        }
                    }
                }
            }
        }

        // Step 3
        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = DarkSurface),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(modifier = Modifier.padding(16.dp)) {
                    Box(
                        modifier = Modifier
                            .size(28.dp)
                            .clip(RoundedCornerShape(14.dp))
                            .background(AccentColor),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("3", color = Color.White, fontWeight = FontWeight.Bold)
                    }
                    Spacer(modifier = Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Configure Blocking Rules", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = LightText)
                        Text("Toggle verification filters or silence rules inside the Settings tab to fit your daily privacy needs.", fontSize = 11.sp, color = MutedText)
                    }
                }
            }
        }

        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = DarkSurface),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Privacy & Security Guarantee", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = GuardTeal)
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "Your call records, phone numbers, and contacts never leave this device. CallGuard runs entirely offline, processes data locally using a secure Room SQLite database, and never communicates with third-party tracking networks.",
                        fontSize = 11.sp,
                        color = MutedText
                    )
                }
            }
        }
    }
}
