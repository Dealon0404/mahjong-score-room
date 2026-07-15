# Product Requirements Document: 雀數

## 1. Product Summary

`雀數` is a Cantonese-first Hong Kong Mahjong scoring app for casual in-person games. It helps a table of four players create a room, select table rules, record each hand, track dealer/wind progression, handle draws, undo mistakes, and settle payments with a WhatsApp-friendly summary.

The current delivery target is a Progressive Web App (PWA) that can be hosted over HTTPS and added to an iPhone Home Screen without requiring an Apple Developer account.

## 2. Problem Statement

Casual Mahjong groups often track scores manually with paper, notes, or calculators. This creates common issues:

- Players forget the exact table rules.
- Calculations for `半銃`, `全銃`, `半辣上`, `辣辣上`, and caps are easy to miscalculate.
- Dealer, wind round, repeated dealer, and draws are easy to lose track of.
- Counting fan from a completed hand can cause disputes when players remember different rule details.
- Settlement at the end takes time and can cause disputes.
- Existing tools often do not feel natural for Cantonese-speaking Hong Kong players.

## 3. Goals

- Provide a Cantonese UI that feels natural for Hong Kong Mahjong players.
- Make score recording fast enough to use during a live Mahjong game.
- Automatically calculate payments and final settlement.
- Track dealer and wind round automatically.
- Provide a camera-assisted fan counting flow that can suggest fan count and explain the reasoning before the user accepts it.
- Support PWA install on iPhone without Apple Developer requirements.
- Keep MVP usable locally and as a hosted HTTPS web app.

## 4. Non-Goals

- Real-money payment processing.
- Online gambling or betting facilitation.
- App Store release in the MVP phase.
- Full multi-device real-time sync before backend integration.
- Complete support for every regional Mahjong scoring variant.
- Fully reliable optical tile recognition in MVP without a trained vision model or backend API.

## 5. Target Users

### Primary User

A Hong Kong Mahjong player who hosts casual in-person games with friends or family and wants a fast Cantonese scoring tool.

### Secondary Users

- Other seated players who want to check totals.
- Players joining by room code or QR code in a future synced version.
- Users who want to save favourite table rules for repeated games.

## 6. User Personas

### Room Owner

- Creates the room.
- Chooses the table rule.
- Shares room code or QR code.
- Records wins, draws, notes, and corrections.
- Shares final settlement.

### Player

- Enters or edits their display name.
- Checks their current total.
- Reviews game history and settlement.

## 7. Current MVP Scope

### Platform

- Desktop/browser preview via `web-preview.html`.
- PWA support via `manifest.webmanifest` and `service-worker.js`.
- iPhone Home Screen installation through Safari when hosted on HTTPS.
- Expo React Native app exists, but the PWA is the main Apple Developer bypass path.

### Language and Tone

- Traditional Chinese with Cantonese phrasing.
- Labels should use familiar Mahjong terms such as `開新房`, `流局`, `調位`, `牌局紀錄`, `結算`, `莊`.

### Room Creation

- User enters display name.
- User creates a room.
- User selects table rules before entering room.
- Room code and QR code are hidden by default and can be shown on demand.

### Table Rules

Supported table rule dimensions:

- Base table size: `二五雞`, `五一`, `一二蚊`
- Discard payment mode: `半銃`, `全銃`
- Growth mode: `半辣上`, `辣辣上`
- Cap: `8番頂`, `10番頂`
- Cap amount presets such as `$64`, `$128`, `$256`, `$512`, `$1024`
- Custom/favourite rule list for frequently used tables

### Seating

- Four seats: `東`, `南`, `西`, `北`.
- Users can enter or edit names per seat.
- Seat cards show current total using red/green color and signed amount only.
- Dealer is marked directly on the dealer seat card with `莊`.
- Wind and current hand, such as `東圈・南局`, are shown in the center Mahjong table area.

### Hand Recording

Supported hand types:

- `自摸`
- `食糊`
- `包自摸`
- `流局`

Hand recording requirements:

- Select winner.
- Select win type.
- Select payer for `食糊` or `包自摸`.
- Select fan count from 0 to 13.
- Show live payment preview before saving.
- Allow per-hand note.
- Camera fan assistant lets the user take or upload a photo of the winning tiles, review an estimated fan count with explanations, accept/reject it, and manually adjust the final fan count.
- MVP camera fan assistant supports a local fallback with user-confirmed common patterns and an optional OpenAI Vision serverless endpoint for real photo-based tile recognition.

### Draw Handling

- User can mark a hand as `流局`.
- Draw records should not change player totals.
- Draw records should preserve dealer and wind state.
- Draw history supports note editing.
- Draw deletion uses a clear confirmation modal.

### Dealer and Wind Tracking

- Initial state starts at `東圈・東局` with East seat as dealer.
- If dealer wins, dealer continues.
- If hand is a draw, dealer continues.
- If non-dealer wins, dealer advances to next seat.
- When dealer advances from North to East, round wind advances.
- Undo/delete should recalculate the current dealer and wind state.

### Undo and Correction

- `還原上一鋪` removes the latest hand after confirmation.
- Saved hands can be modified or deleted.
- Deleting a hand recalculates totals and dealer/wind state.

### History

- History lists all recorded hands in reverse chronological order.
- Each record shows hand number, result, fan count, wind/seat state, note, updated time, and per-player payments.
- Draw records show `流局`, zero payments, and draw-specific actions.

### Settlement

- Show total win/loss per player.
- Calculate minimum transactions needed to settle.
- Export/share a Cantonese text summary for WhatsApp.

### PWA Installation

- App has a manifest with name `雀數`.
- App supports standalone display mode.
- App has app icons from existing assets.
- Service worker caches the static app shell.
- HTTPS hosting is required for iPhone Home Screen install behavior.

## 8. Functional Requirements

### FR-1: Create Room

The user can create a new room after choosing table rules.

Acceptance Criteria:

- Room name defaults to `今晚麻雀局`.
- Room has unique code.
- User enters room screen after creation.
- Four empty seats are created.

### FR-2: Select Table Rule

The user can select a table rule from supported rule dimensions.

Acceptance Criteria:

- Selected table rule summary updates immediately.
- Rule is used for all subsequent scoring calculations.
- User can save named favourite rule presets.

### FR-3: Manage Seats

The user can edit player names and view totals by seat.

Acceptance Criteria:

- Each seat shows seat wind, player name, and signed total.
- Dealer badge appears on current dealer seat only.
- Positive and negative totals use distinct colors.
- `賺` and `蝕` words are not shown on seat totals.

### FR-4: Record Winning Hand

The user can record a winning hand.

Acceptance Criteria:

- Winner is selected by tapping/clicking a seat.
- User can select `自摸`, `食糊`, or `包自摸`.
- Payer is required for `食糊` and `包自摸`.
- Fan count is required.
- Live preview shows payments before saving.
- Saving updates history, totals, dealer, and wind state.

### FR-5: Record Draw

The user can mark a draw.

Acceptance Criteria:

- Draw creates a history record with zero payments.
- Draw keeps the same dealer and wind state.
- User receives confirmation that draw was recorded.

### FR-6: Undo Latest Hand

The user can undo the latest hand.

Acceptance Criteria:

- Confirmation is shown before undo.
- Latest hand is removed.
- Totals, dealer, and wind are recalculated.

### FR-7: Edit and Delete History

The user can modify or delete saved records.

Acceptance Criteria:

- Winning hands can be edited.
- Draw notes can be edited.
- Delete action requires confirmation.
- Draw deletion has wording `刪除流局`.

### FR-8: Settlement Export

The user can share settlement text.

Acceptance Criteria:

- Export includes room name, table rule, wind/dealer state, totals, and minimum settlement lines.
- Text is copyable/shareable for WhatsApp.

### FR-9: PWA Hosting

The app can be hosted as static files.

Acceptance Criteria:

- `dist/index.html` opens the app.
- `manifest.webmanifest` is served correctly.
- `service-worker.js` is served correctly.
- Hosted URL uses HTTPS.
- iPhone Safari can add the app to Home Screen.

### FR-10: Camera Fan Assistant

The user can use the device camera during hand recording to assist fan counting.

Acceptance Criteria:

- Hand recording screen includes an `影相計番` action.
- On mobile, the action opens the camera/photo picker using a rear-camera capture hint where supported.
- Selected photo is previewed before the user accepts a result.
- App shows an estimated fan count and a detail list explaining why that fan count was suggested.
- User can add common pattern adjustments before accepting.
- Accept fills the fan count field, updates live payment preview, and appends explanation to the hand note.
- Reject closes the analysis result without changing the manually selected fan count.
- MVP clearly labels local fallback behavior when no vision API endpoint or API key is configured.
- Optional backend endpoint `/api/analyze-tiles` accepts a tile photo and hand context, calls Vision AI, and returns recognized tiles, confidence, fan count, reasons, and warnings.

## 9. Non-Functional Requirements

### Performance

- App should load within 3 seconds on a normal mobile connection after first visit.
- Score calculation should update instantly for local data.

### Availability

- PWA should work offline after first successful load for core local scoring.
- QR code image generation may require network access.

### Usability

- Main room screen should be usable one-handed on mobile.
- Core actions should be visible without deep navigation.
- Text should not overflow in mobile seat cards.

### Accessibility

- Buttons should have clear labels.
- Color should not be the only meaning for critical actions; signed amounts should also be shown.
- Touch targets should be large enough for mobile use.

### Data Storage

- MVP stores room data locally in browser storage.
- Data is not guaranteed to sync across devices until backend integration.

### Security and Privacy

- No payment credentials or personal secrets are stored.
- Room data is local-only in MVP.
- Tile photos stay in-browser in MVP unless the user/team configures a future vision API endpoint.
- When Vision AI is enabled, tile photos are sent to the configured serverless endpoint and then to the model provider for analysis.
- Future backend must restrict room access to room participants.

## 10. Deployment Requirements

### Current Recommended Deployment

GitHub Pages static hosting for PWA-only scoring, or Vercel when the camera fan assistant should use the included `/api/analyze-tiles` Vision AI endpoint.

Required files:

- `dist/index.html`
- `dist/web-preview.html`
- `dist/manifest.webmanifest`
- `dist/service-worker.js`
- `dist/assets/*`

GitHub Actions workflow:

- `.github/workflows/pages.yml`

Expected output:

- `https://<username>.github.io/<repo>/`

Vision AI deployment:

- Deploy the project to Vercel.
- Set `OPENAI_API_KEY` and optionally `OPENAI_VISION_MODEL`.
- Frontend calls same-origin `/api/analyze-tiles` by default, or a custom URL stored in `mahjong-tile-vision-endpoint`.

### iPhone Installation Flow

1. Open hosted HTTPS URL in Safari.
2. Tap Share.
3. Tap Add to Home Screen.
4. Confirm app name `雀數`.
5. Launch from Home Screen icon.

## 11. Analytics and Success Metrics

MVP success indicators:

- User can complete a full 4-player game locally without paper scoring.
- User can record at least 10 hands without calculation errors.
- User can undo/delete/edit records without losing dealer/wind accuracy.
- User can share settlement summary in WhatsApp.
- User can install the PWA to iPhone Home Screen without Apple Developer.

Future metrics after backend/analytics:

- Number of rooms created.
- Average hands recorded per room.
- Percentage of rooms reaching settlement screen.
- Favourite rule usage rate.
- PWA install/start rate.

## 12. Risks and Mitigations

### Risk: No Apple Developer Account

Mitigation: Use PWA and GitHub Pages HTTPS hosting for iPhone Home Screen install.

### Risk: Local-Only Data

Mitigation: Clearly define MVP as local-first; add Firebase/Firestore in later phase.

### Risk: Rule Variants

Mitigation: Start with common Hong Kong table rules; add custom rule editor gradually.

### Risk: Camera Fan Accuracy

Mitigation: MVP uses camera capture plus user-confirmed pattern adjustments and manual override. True automatic tile recognition should be added through a dedicated vision model/API and tested against real tile photos.

### Risk: QR Code Expectations

Mitigation: In MVP, QR is primarily room-code sharing; real multi-device sync requires backend.

## 13. Future Roadmap

### Phase 1: PWA MVP

- Finish GitHub Pages deployment.
- Validate iPhone Home Screen installation.
- Polish mobile layout and copy.

### Phase 2: Persistence and Multi-Device Sync

- Add Firebase Auth.
- Add Firestore rooms, players, rounds, settings.
- Add real-time updates across devices.
- Add room access security rules.
- Harden the optional image-analysis endpoint for production usage, including rate limiting, stricter CORS, logging controls, and model evaluation against real Mahjong tile photos.

### Phase 3: Account and Social Features

- Player profiles.
- Saved favourite table rules across devices.
- Game archive.
- Share invite link and QR with live join.

### Phase 4: Native App Option

- Use EAS build for iOS/Android.
- Submit via TestFlight/App Store if Apple Developer account becomes available.

## 14. Open Questions

- Which additional Hong Kong Mahjong scoring rules should be supported first?
- Should `流局` always keep dealer, or should table-rule options allow dealer rotation on draw?
- Should favourite table rules sync across rooms and devices?
- Should hosted PWA be public or private?
- Should future backend support multiple simultaneous rooms per user?
