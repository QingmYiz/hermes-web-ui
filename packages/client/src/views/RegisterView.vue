<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { setApiKey } from "@/api/client";
import { registerWithPassword } from "@/api/auth";

const { t } = useI18n();
const router = useRouter();

const username = ref("");
const password = ref("");
const confirmPassword = ref("");
const loading = ref(false);
const errorMsg = ref("");

async function handleRegister() {
  const cleanUsername = username.value.trim();
  if (!cleanUsername || !password.value) {
    errorMsg.value = t("login.credentialsRequired");
    return;
  }
  if (cleanUsername.length < 2) {
    errorMsg.value = t("login.usernameTooShort");
    return;
  }
  if (password.value.length < 6) {
    errorMsg.value = t("login.passwordTooShort");
    return;
  }
  if (password.value !== confirmPassword.value) {
    errorMsg.value = t("login.passwordMismatch");
    return;
  }

  loading.value = true;
  errorMsg.value = "";

  try {
    const result = await registerWithPassword(cleanUsername, password.value);
    setApiKey(result.token);
    if (result.profile) {
      localStorage.setItem("hermes_active_profile_name", result.profile);
    }
    router.replace("/hermes/chat");
  } catch (err: any) {
    if (err.status === 409) {
      errorMsg.value = t("login.usernameTaken");
    } else {
      errorMsg.value = err.message || t("login.registrationFailed");
    }
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="register-view">
    <div class="register-card">
      <div class="register-logo">
        <img src="/logo.png" alt="Hermes" width="80" height="80" />
      </div>
      <h1 class="register-title">{{ t("login.registerTitle") }}</h1>
      <p class="register-desc">{{ t("login.registerDescription") }}</p>

      <form class="register-form" @submit.prevent="handleRegister">
        <input
          v-model="username"
          type="text"
          class="register-input"
          :placeholder="t('login.usernamePlaceholder')"
          autofocus
        />
        <input
          v-model="password"
          type="password"
          class="register-input"
          :placeholder="t('login.passwordPlaceholder')"
        />
        <input
          v-model="confirmPassword"
          type="password"
          class="register-input"
          :placeholder="t('login.confirmPasswordPlaceholder')"
          @keyup.enter="handleRegister"
        />

        <div v-if="errorMsg" class="register-error">{{ errorMsg }}</div>
        <button type="submit" class="register-btn" :disabled="loading">
          {{ loading ? "..." : t("login.registerSubmit") }}
        </button>
      </form>

      <button class="register-link" type="button" @click="router.push({ name: 'login' })">
        {{ t("login.alreadyHaveAccount") }}
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use "@/styles/variables" as *;

.register-view {
  height: calc(100 * var(--vh));
  display: flex;
  align-items: center;
  justify-content: center;
  background: $bg-primary;
}

.register-card {
  width: 480px;
  max-width: calc(100vw - 32px);
  padding: 56px;
  border: 1px solid $border-color;
  border-radius: $radius-lg;
  background: $bg-card;
  text-align: center;

  @media (max-width: $breakpoint-mobile) {
    padding: 32px 24px;
  }
}

.register-logo {
  margin-bottom: 24px;
}

.register-title {
  font-size: 26px;
  font-weight: 600;
  color: $text-primary;
  margin: 0 0 10px;
}

.register-desc {
  font-size: 14px;
  color: $text-muted;
  margin: 0 0 28px;
  line-height: 1.6;
}

.register-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.register-input {
  width: 100%;
  padding: 14px 16px;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  font-size: 15px;
  color: $text-primary;
  background: $bg-input;
  outline: none;
  transition: border-color $transition-fast;
  box-sizing: border-box;
  font-family: $font-code;

  &::placeholder {
    color: $text-muted;
  }

  &:focus {
    border-color: $accent-primary;
  }
}

.register-error {
  font-size: 13px;
  color: $error;
  text-align: left;
}

.register-btn {
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: $radius-sm;
  background: $text-primary;
  color: var(--text-on-accent);
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity $transition-fast;

  &:hover {
    opacity: 0.85;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.register-link {
  margin-top: 18px;
  border: 0;
  background: transparent;
  color: $text-secondary;
  font-size: 13px;
  cursor: pointer;

  &:hover {
    color: $accent-primary;
  }
}
</style>
