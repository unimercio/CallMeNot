package com.enrique.callguard.data

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Delete
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import kotlinx.coroutines.flow.Flow

// ==========================================
// ROOM ENTITIES
// ==========================================

@Entity(tableName = "blacklist")
data class BlacklistItem(
    @PrimaryKey val number: String, // Normalized E.164 phone number
    val reason: String = "Blocked Spam",
    val createdAt: Long = System.currentTimeMillis()
)

@Entity(tableName = "screened_call_logs")
data class ScreenedCallLog(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val number: String,
    val timestamp: Long = System.currentTimeMillis(),
    val actionTaken: String, // "REJECTED", "SILENCED", "PASSED"
    val reason: String, // e.g., "In Blacklist", "STIR/SHAKEN Verification Failed", "Silence Unknowns enabled"
    val verificationStatus: Int // STIR/SHAKEN status, e.g. Connection verification status
)

// ==========================================
// ROOM DAOS
// ==========================================

@Dao
interface BlacklistDao {
    @Query("SELECT * FROM blacklist ORDER BY createdAt DESC")
    fun getAllFlow(): Flow<List<BlacklistItem>>

    @Query("SELECT * FROM blacklist ORDER BY createdAt DESC")
    suspend fun getAll(): List<BlacklistItem>

    @Query("SELECT * FROM blacklist WHERE number = :number LIMIT 1")
    suspend fun findByNumber(number: String): BlacklistItem?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(item: BlacklistItem)

    @Delete
    suspend fun delete(item: BlacklistItem)

    @Query("DELETE FROM blacklist WHERE number = :number")
    suspend fun deleteByNumber(number: String)
}

@Dao
interface CallLogDao {
    @Query("SELECT * FROM screened_call_logs ORDER BY timestamp DESC")
    fun getAllLogsFlow(): Flow<List<ScreenedCallLog>>

    @Query("SELECT * FROM screened_call_logs ORDER BY timestamp DESC LIMIT :limit")
    suspend fun getRecentLogs(limit: Int): List<ScreenedCallLog>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(log: ScreenedCallLog)

    @Query("DELETE FROM screened_call_logs")
    suspend fun clearAll()
}

// ==========================================
// ROOM DATABASE CLASS
// ==========================================

@Database(entities = [BlacklistItem::class, ScreenedCallLog::class], version = 1, exportSchema = false)
abstract class AppDatabase : RoomDatabase() {
    abstract fun blacklistDao(): BlacklistDao
    abstract fun callLogDao(): CallLogDao

    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null

        fun getDatabase(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "call_guard_database"
                )
                .fallbackToDestructiveMigration()
                .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
