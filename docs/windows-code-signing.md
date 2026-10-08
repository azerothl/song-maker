# Windows code signing

Windows release builds use Microsoft Artifact Signing to Authenticode-sign the Tauri executable and the Windows installer. This is separate from Tauri updater signatures: Authenticode identifies the publisher to Windows, while Tauri signatures authenticate downloaded app updates.

## One-time Azure setup

Create an Artifact Signing account and a Public Trust certificate profile, complete Microsoft's identity validation, and grant a service principal the `Artifact Signing Certificate Profile Signer` role for that profile. Configure the service principal with a client secret for the GitHub Actions workflow.

In the GitHub repository, add these Actions **variables**:

| Variable | Value |
| --- | --- |
| `WINDOWS_SIGNING_ENDPOINT` | The endpoint for the account's region, such as `https://eus.codesigning.azure.net/` |
| `WINDOWS_SIGNING_ACCOUNT` | Artifact Signing account name |
| `WINDOWS_SIGNING_PROFILE` | Public Trust certificate profile name |

Add these Actions **secrets**:

| Secret | Value |
| --- | --- |
| `AZURE_CLIENT_ID` | Service principal application/client ID |
| `AZURE_CLIENT_SECRET` | Service principal client secret |
| `AZURE_TENANT_ID` | Microsoft Entra tenant/directory ID |

The release workflow checks that all six values exist, installs the pinned Artifact Signing CLI, and configures Tauri's Windows bundler to sign the app and installer before uploading them. Windows releases fail closed when signing is not configured; other platform builds are unaffected.

Before the draft becomes a published release, the workflow verifies `Get-AuthenticodeSignature` returns `Valid` for the app executable and every MSI/EXE installer. The configuration alone does not establish that an already published installer is signed. No newly signed release was produced by the 2026-10-05 conformity audit.

## SmartScreen expectations

Signing displays a verified publisher and lets reputation accumulate under a stable signing identity. SmartScreen can still warn on early downloads until the publisher or file has enough reputation; signing does not guarantee an immediate warning-free first release. If Defender Antivirus reports a malware detection rather than an unknown publisher, submit that specific release file to Microsoft for false-positive review.

Artifact Signing account availability, identity validation, and setup are managed in the Azure portal. See Microsoft's [Artifact Signing quickstart](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart), [GitHub Actions integration](https://github.com/Azure/artifact-signing-action), and [Tauri Windows signing guide](https://v2.tauri.app/distribute/sign/windows/).
