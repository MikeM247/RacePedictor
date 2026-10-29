# Orbit Voice — Business Requirements

28 October 2026 · Product Owner brief · Proposed scope for architecture

## Business need

The self-coaching runner needs to reflect after a run and prepare for the next session without lengthy typing. Orbit already provides contextual, persistent text coaching; voice should make that coaching easier to use and preserve a clear next action.

**Outcome:** speak a reflection, check what Orbit heard, receive contextual advice, and inspect the relevant training record without repeating the workout details.

## Users and priority journeys

- **Primary:** the existing authenticated athlete, initially the owner's own daily use.
- **Post-run:** discuss why the selected completed activity felt harder than expected.
- **Pre-run:** understand the next prescribed session and discuss a time or recovery constraint.
- **Secondary:** listen to a saved reply while stretching or preparing to train.

This is an online Coach enhancement. The initial experience is used before or after training; it does not provide live workout monitoring.

## Business requirements and delivery scope

| ID | Requirement | Delivery |
| --- | --- | --- |
| OV-B01 | Reduce the effort of entering a coaching message through reviewable voice dictation. | V1: required |
| OV-B02 | Keep text and voice within the same athlete conversation and current training context. | V1: required |
| OV-B03 | Keep the athlete in control of recording, sending, correcting, and cancelling. | V1: required |
| OV-B04 | Preserve typed work and provide usable text recovery when voice fails. | V1: required |
| OV-B05 | Make current-chat coach replies available as optional on-demand audio. | V1.1: separate follow-on |
| OV-B06 | Establish whether live conversation adds enough value to justify its operating cost and complexity. | Discovery only |

**Excluded:** live voice delivery, always-listening or background recording, in-run guidance, new chat/thread models, generated lasting memory, access to personal ChatGPT history, automatic wellbeing capture, plan/calendar writes, a new prediction model, and a Home or navigation redesign.

## Product decisions

1. Enhance `/dashboard/coach`; retain Home and the existing Orbit identity and design system.
2. Speak → transcribe → review/edit → explicitly send through the existing coaching service. A microphone button does not start a live call.
3. Keep one current athlete conversation. Clear chat archives it; previous chats remain read-only and excluded from active AI history. Training context continues to refresh from app records.
4. Suggestions remain advice. Existing explicit forms and approval workflows own structured changes.
5. Do not retain raw recordings in application storage. Explain external speech processing before the first recording; retained sent transcripts follow existing chat controls.
6. Use the current coaching backend. Speech-provider choice is an architecture decision; activity-review provider settings are not evidence of equivalent chat/audio support.

## Value and success measures

Pilot with the owner first, using real daily journeys and synthetic test fixtures where instrumentation is needed. These are proposed acceptance targets, not observed results:

| Measure | Pilot decision evidence |
| --- | --- |
| Usability | At least 9 of 10 representative dictation tasks completed without assistance; include correction and failure recovery. |
| Practical value | Voluntary use on at least 3 separate training days, with a short account of whether voice reduced effort relative to typing. |
| Coaching clarity | Athlete can identify the selected workout and next action after each completed pilot journey. |
| Reliability and trust | No lost pre-existing drafts, unintended sends, cross-chat audio/transcript leakage, or structured training writes. |
| Performance and economics | Measured transcription delay, failure rate, and cost per successful exchange meet the release targets and a recorded operating budget. |

V1.1 is assessed after V1 establishes useful recurring use. Live voice requires a separate go/no-go recommendation based on tested latency, interruption handling, mobile behaviour, privacy and cost.

## Dependencies and risks

- Supported phone/desktop browsers must permit microphone capture over the authenticated site; permission denial retains text coaching.
- Speech recognition must handle the athlete's accent, training vocabulary, paces and units. Editable transcripts are essential.
- The current Coach returns complete replies. Speech adds delay; architecture must measure each stage before committing to a live experience.
- Speech services add processing and operating costs. Availability, data handling, language support and quotas require a technical spike.
- New requirements are a proposed extension to the approved text-only iteration. Earlier exclusions remain historical context; this package does not claim voice is implemented or released.

## Handoff

[Requirements and acceptance](REQUIREMENTS.md) define the architecture contract. [Designer handoff](../../design/orbit-voice/UI_UX_HANDOFF.md) supplies flows, states, screen changes and mockups. [Package guide](README.md) identifies document precedence and the architecture decisions to resolve.
