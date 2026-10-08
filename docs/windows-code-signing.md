# Windows code signing

## Release policy

Song Maker releases before v1.0.0 do not require Authenticode signing. Windows may show SmartScreen for those installers. Starting with v1.0.0, the release workflow requires Authenticode signatures on the app and each Windows installer and verifies them before publishing.

Tauri updater signatures are separate and remain required for every release. They verify updates against the public key embedded in Song Maker.

## One-time Azure setup for v1.0.0+

Create an Artifact Signing account and a Public Trust certificate profile, complete Microsoft identity validation, and grant a service principal the Artifact Signing Certificate Profile Signer role. Configure the service principal with a client secret for GitHub Actions.

In the GitHub repository, add these Actions variables:

| Variable | Value |
| --- | --- |
| WINDOWS_SIGNING_ENDPOINT | Endpoint for the account region |
| WINDOWS_SIGNING_ACCOUNT | Artifact Signing account name |
| WINDOWS_SIGNING_PROFILE | Public Trust certificate profile name |

Add these Actions secrets:

| Secret | Value |
| --- | --- |
| AZURE_CLIENT_ID | Service principal application/client ID |
| AZURE_CLIENT_SECRET | Service principal client secret |
| AZURE_TENANT_ID | Microsoft Entra tenant/directory ID |

For v1.0.0 and later, the release workflow checks that all six values exist, signs the app and installers, then verifies that Get-AuthenticodeSignature returns Valid for each file.

Signing displays a verified publisher and lets reputation accumulate under a stable identity. SmartScreen can still warn on early downloads. If Defender reports malware rather than an unknown publisher, submit that release file to Microsoft for false-positive review.

See Microsoft’s Artifact Signing quickstart, GitHub Actions integration, and the Tauri Windows signing guide.