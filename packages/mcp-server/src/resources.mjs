import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { runtimeStatus } from './runtime.mjs';
import { generationSettingsRevision, readSongMakerRuntimeSettings } from './song-maker-settings.mjs';
import { YUE2_COMMON, YUE2_MODELS } from './yue2-assets.mjs';
const SEPARATORS = [
  { id: 'htdemucs', file: 'htdemucs/htdemucs-q8_0.gguf', bytes: 61_940_768 },
  { id: 'bs_roformer', file: 'bs_roformer/bs-roformer-ep368-q8_0.gguf', bytes: 172_532_256 },
  { id: 'mel_band_roformer', file: 'mel_band_roformer/mel-band-roformer-q8_0.gguf', bytes: 251_748_928 },
];
const ACE_STEP = {
  id: 'ace_step',
  file: 'models/ACE-Step1.5-GGUF/turbo/ace-step-1.5-turbo-bf16.gguf',
  bytes: 10_090_398_272,
};
const ACE_STEP_LEGO = {
  id: 'ace_step_lego',
  runtimeId: 'ace_step_1_5_base_lego',
  pythonWindows: 'Scripts/python.exe',
  pythonUnix: 'bin/python',
  receipt: 'installation-verified.json',
  gitSource: 'git+https://github.com/ace-step/ACE-Step-1.5.git@ca1e85fe9430179831e6bc6be790c332190a3866',
};

async function exactFile(cacheDirectory, relativePath, expectedBytes) {
  try {
    const metadata = await stat(path.join(cacheDirectory, 'models', relativePath));
    return metadata.isFile() && metadata.size === expectedBytes;
  } catch {
    return false;
  }
}

async function isFile(filePath) {
  try { return (await stat(filePath)).isFile(); }
  catch { return false; }
}

async function aceStepLegoRuntime(cacheDirectory, env) {
  const root = path.join(cacheDirectory, 'tools', 'ace-step-lego');
  const pythonPath = path.join(root, process.platform === 'win32'
    ? ACE_STEP_LEGO.pythonWindows
    : ACE_STEP_LEGO.pythonUnix);
  const pythonPresent = await isFile(pythonPath);
  const [sidecarScriptPresent, receiptText] = await Promise.all([
    isFile(path.join(root, 'ace-step-lego-sidecar.py')),
    readFile(path.join(root, ACE_STEP_LEGO.receipt), 'utf8').catch(() => null),
  ]);
  let installationVerified = false;
  try {
    const receipt = receiptText ? JSON.parse(receiptText) : null;
    installationVerified = receipt?.gitSource === ACE_STEP_LEGO.gitSource;
  } catch {}
  const mock = ['1', 'true', 'TRUE', 'yes'].includes(env.SONG_MAKER_ACE_STEP_LEGO_MOCK || '');
  return {
    runtimeInstalled: pythonPresent && installationVerified,
    inferenceAvailable: mock || (pythonPresent && installationVerified),
    pythonPresent,
    sidecarScriptPresent,
    installationVerified,
    mock,
  };
}

async function inspectModel(cacheDirectory, model) {
  const checks = await Promise.all([
    exactFile(cacheDirectory, `Yue2-3B-GGUF/${model.file}`, model.bytes),
    ...YUE2_COMMON.map(item => exactFile(cacheDirectory, `Yue2-3B-GGUF/${item.file}`, item.bytes)),
  ]);
  const commonMissing = YUE2_COMMON.filter((_item, index) => !checks[index + 1]).map(item => item.id);
  return {
    id: model.id,
    file: model.file,
    installed: checks.every(Boolean),
    missingComponents: [
      ...(checks[0] ? [] : [model.file]),
      ...commonMissing,
    ],
  };
}

export async function listLocalResources({ env = process.env } = {}) {
  const settings = readSongMakerRuntimeSettings(env);
  const { profileSettings } = settings;
  const cacheDirectory = settings.cacheDirectory;
  const selectedYuE2Model = settings.appModelId;
  const mcpSelectedYuE2Model = settings.modelId;
  const yue2Models = await Promise.all(YUE2_MODELS.map(model => inspectModel(cacheDirectory, model)));
  const selectedSeparator = typeof profileSettings.stemSeparator === 'string' ? profileSettings.stemSeparator : 'htdemucs';
  const separators = await Promise.all(SEPARATORS.map(async separator => ({
    id: separator.id,
    selected: selectedSeparator === separator.id,
    installed: await exactFile(cacheDirectory, separator.file, separator.bytes),
    licenseAccepted: profileSettings.acceptedSeparatorLicenses?.[separator.id] === true,
  })));
  const aceStepInstalled = await exactFile(cacheDirectory, ACE_STEP.file.replace(/^models\//, ''), ACE_STEP.bytes);
  const aceStepLegoRuntimeStatus = await aceStepLegoRuntime(cacheDirectory, env);
  const selectedEngine = settings.selectedEngine;
  const yue2Runtime = runtimeStatus({ engineId: 'yue2', env });
  const aceStepRuntime = runtimeStatus({ engineId: 'ace_step', env });
  const mcpGenerationEngine = settings.selectedEngine === 'ace_step' ? 'ace_step' : 'yue2';
  const selectedRuntime = mcpGenerationEngine === 'ace_step' ? aceStepRuntime : yue2Runtime;
  const mcpGenerationBlockers = [];
  if (mcpGenerationEngine === 'ace_step') {
    if (!profileSettings.aceStepLicenseAccepted) mcpGenerationBlockers.push('L’avertissement de licence ACE-Step n’a pas été accepté dans le profil actif.');
    if (!aceStepRuntime.aceStepContractAccepted) mcpGenerationBlockers.push('Le profil Commercial doit accepter l’avertissement ACE-Step actuel dans Song Maker.');
    if (aceStepRuntime.missing.includes('audiocpp_server')) mcpGenerationBlockers.push('Le serveur audio local est absent.');
    if (aceStepRuntime.missing.includes('ACE-Step 1.5 Turbo BF16')) mcpGenerationBlockers.push('Le modèle ACE-Step 1.5 Turbo BF16 est absent ou incomplet.');
  } else {
    if (!settings.localYue2Enabled) mcpGenerationBlockers.push('YuE2 est désactivé dans le profil actif.');
    if (!settings.yue2LicenseAccepted && env.SONG_MAKER_YUE2_NONCOMMERCIAL !== '1') {
      mcpGenerationBlockers.push('La licence non commerciale YuE2 n’a pas été acceptée dans le profil actif.');
    }
    if (yue2Runtime.missing.includes('audiocpp_cli')) {
      mcpGenerationBlockers.push('Le moteur audio YuE2 est absent ou incomplet.');
    }
    if (yue2Runtime.missing.includes('YuE2 Q4 ou Q8')) {
      mcpGenerationBlockers.push('Le modèle YuE2 sélectionné ou un composant requis est absent.');
    }
    if (yue2Runtime.missing.includes('YuE2 VAE')) {
      mcpGenerationBlockers.push('Le composant VAE YuE2 est absent ou incomplet.');
    }
    for (const sidecar of yue2Runtime.missing.filter(item => item.startsWith('sidecar:'))) {
      mcpGenerationBlockers.push(`Le composant ${sidecar.slice('sidecar:'.length)} est absent ou incomplet.`);
    }
  }

  return {
    profileId: settings.profileId,
    settingsRevision: generationSettingsRevision(settings),
    selectedEngine,
    localYue2Enabled: settings.localYue2Enabled,
    selectedYuE2Model,
    mcpSelectedYuE2Model,
    selectedSeparator,
    licenses: {
      yue2Accepted: profileSettings.yue2LicenseAccepted === true,
      aceStepAccepted: profileSettings.aceStepLicenseAccepted === true,
      aceStepLegoAccepted: profileSettings.aceStepLegoLicenseAccepted === true,
      ccByNcAccepted: profileSettings.ccByNcAccepted === true,
    },
    mcpGenerationEngine,
    mcpGenerationEngines: [
      { id: 'yue2', supported: true, default: mcpGenerationEngine === 'yue2', selectedInApp: selectedEngine === 'yue2' },
      { id: ACE_STEP.id, supported: true, default: mcpGenerationEngine === ACE_STEP.id, selectedInApp: selectedEngine === ACE_STEP.id,
        ready: aceStepRuntime.ready && aceStepRuntime.aceStepLicenseAccepted && aceStepRuntime.aceStepContractAccepted,
        missing: aceStepRuntime.missing,
        licenseAccepted: aceStepRuntime.aceStepLicenseAccepted,
        contractAccepted: aceStepRuntime.aceStepContractAccepted },
      { id: ACE_STEP_LEGO.id, supported: false, reason: 'Le moteur ACE-Step Lego n’est pas pilotable depuis MCP.' },
    ],
    mcpUsesActiveAppProfile: true,
    mcpGenerationReady: selectedRuntime.ready && mcpGenerationBlockers.length === 0,
    mcpGenerationBlockers,
    mcpRuntimeMissing: selectedRuntime.missing,
    mcpModelSource: selectedRuntime.modelSource,
    engines: [
      {
        id: 'yue2',
        selected: selectedEngine === 'yue2',
        mcpGenerationSupported: true,
        models: yue2Models.map(model => ({
          ...model,
          selected: model.id === selectedYuE2Model,
          mcpSelected: model.id === mcpSelectedYuE2Model,
        })),
      },
      {
        id: ACE_STEP.id,
        selected: selectedEngine === ACE_STEP.id,
        installed: aceStepInstalled,
        licenseAccepted: profileSettings.aceStepLicenseAccepted === true,
        mcpGenerationSupported: true,
        mcpGenerationReady: aceStepRuntime.ready && aceStepRuntime.aceStepLicenseAccepted && aceStepRuntime.aceStepContractAccepted,
        missing: aceStepRuntime.missing,
        contractAccepted: aceStepRuntime.aceStepContractAccepted,
      },
      {
        id: ACE_STEP_LEGO.id,
        runtimeId: ACE_STEP_LEGO.runtimeId,
        selected: selectedEngine === ACE_STEP_LEGO.id,
        ...aceStepLegoRuntimeStatus,
        licenseAccepted: profileSettings.aceStepLegoLicenseAccepted === true,
        mcpGenerationSupported: false,
      },
    ],
    separators,
    selectionAndInstallationViaMcp: 'activate-installed-only',
    resourceInstallationViaMcp: 'unavailable',
    settingsActivationRequiresAppClosed: true,
  };
}
