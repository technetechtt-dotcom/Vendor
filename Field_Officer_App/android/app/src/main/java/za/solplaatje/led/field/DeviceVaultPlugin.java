package za.solplaatje.led.field;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Non-exportable device key wraps the PIN-encrypted offline vault. */
@CapacitorPlugin(name = "DeviceVault")
public class DeviceVaultPlugin extends Plugin {
    private static final String ALIAS = "solplaatje.field.vault.v1";
    private SecretKey getKey(boolean create) throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(ALIAS)) return (SecretKey) store.getKey(ALIAS, null);
        if (!create) throw new IllegalStateException("Original device key is unavailable");
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256).setRandomizedEncryptionRequired(true).build());
        return generator.generateKey();
    }
    @PluginMethod
    public void seal(PluginCall call) {
        try {
            String value = call.getString("value");
            if (value == null) {call.reject("Missing vault data"); return;}
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, getKey(true));
            byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
            String result = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + "." + Base64.encodeToString(encrypted, Base64.NO_WRAP);
            JSObject response = new JSObject(); response.put("value", result); call.resolve(response);
        } catch (Exception error) {call.reject("Device encryption failed", error);}
    }
    @PluginMethod
    public void open(PluginCall call) {
        try {
            String value = call.getString("value");
            if (value == null) {call.reject("Missing vault data"); return;}
            String[] parts = value.split("\\.", 2);
            if (parts.length != 2) {call.reject("Invalid encrypted device data"); return;}
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, getKey(false), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
            String result = new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
            JSObject response = new JSObject(); response.put("value", result); call.resolve(response);
        } catch (Exception error) {call.reject("This vault could not be opened on this device", error);}
    }
}
