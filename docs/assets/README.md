# Showcase media provenance

The six animated WebP clips in this directory were extracted from the owner's real screen recording, `Atomic_Closeout_Final_Demo.mp4` (367.916 seconds, 2560 × 1410, H.264; SHA-256 `4a3b47bec7510147db73b38b165c0ca412f8772b8fdf29c04bb922bcde630376`). [Watch the full demo on YouTube](https://www.youtube.com/watch?v=xWpZg0jgYL0). The source was read from the owner's Desktop on 2026-10-26. It is intentionally not committed (44,044,187 bytes). The corresponding MKV is `2026-10-26 08-37-09.mkv` in the owner's Videos directory.

| Preview | Source interval (seconds) | Subject |
|---|---:|---|
| `overview.webp` | 0–5 | App landing and labelled synthetic sample card |
| `expenses.webp` | 100–106 | Real demo expense editor and split controls |
| `approvals.webp` | 194–200 | Third wallet approval; 2/3 becomes 3/3 and funding opens |
| `funding.webp` | 265–271 | Debtor funding progress |
| `activity.webp` | 310–316 | Arc Demo Activity and transaction links |
| `withdrawn.webp` | 346–352 | Explorer withdrawal receipt and final UI state |

All clips use the original video frames, cropped to the active app region (`crop=1400:1050:600:80`), scaled to 900 pixels wide, sampled at 6 fps and encoded as animated WebP with FFmpeg. No mock transaction frames or synthetic replacement screens were inserted. GIF/WebP frames show what the recording displayed; receipt and onchain claims are separately checked in [`../MAINNET_EVIDENCE.md`](../MAINNET_EVIDENCE.md).
