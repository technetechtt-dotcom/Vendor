package za.solplaatje.led.field;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.security.KeyStore;
import java.util.UUID;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class DeviceVaultTest {
    private String alias;
    private DeviceVaultPlugin vault;
    @Before public void before() {
        alias = "solplaatje.field.test." + UUID.randomUUID();
        vault = new DeviceVaultPlugin(alias);
    }
    @After public void after() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        store.deleteEntry(alias); store.deleteEntry(alias + ".other");
    }
    @Test public void deviceKeyIsNonExportableAndRoundTripUsesRandomIv() throws Exception {
        String first = vault.sealValue("synthetic private evidence");
        String second = vault.sealValue("synthetic private evidence");
        assertNotEquals(first, second);
        assertFalse(first.contains("synthetic private evidence"));
        assertEquals("synthetic private evidence", vault.openValue(first));
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        assertNull(store.getKey(alias, null).getEncoded());
    }
    @Test public void differentDeviceKeyCannotOpenVault() throws Exception {
        String value = vault.sealValue("synthetic private evidence");
        DeviceVaultPlugin other = new DeviceVaultPlugin(alias + ".other");
        other.sealValue("initialize different key");
        try {other.openValue(value); fail("A different key opened the vault");} catch (javax.crypto.AEADBadTagException expected) { /* authenticated rejection */ }
    }
    @Test public void missingDeviceKeyDoesNotSilentlyGenerateReplacement() throws Exception {
        String value = vault.sealValue("synthetic private evidence");
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null); store.deleteEntry(alias);
        try {vault.openValue(value); fail("Missing key was accepted");} catch (IllegalStateException expected) { /* preserve recoverable failure */ }
    }
}
