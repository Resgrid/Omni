# Getting help with the Resgrid apps

This repository builds the five Resgrid apps — **Responder**, **Unit**, **IC**, **Dispatch** and **BigBoard** — for iOS, Android, web and desktop. Pick the place that fits what you need.

| You need                                              | Go to                                                                                                                |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Every app stopped working or cannot connect           | [Resgrid system status](https://resgrid.freshstatus.io)                                                              |
| Help with your account, billing or department setup   | [Resgrid Help Center](https://resgrid.zohodesk.com/portal/en/home) or [contact Resgrid](https://resgrid.com/contact) |
| Something in one of the apps is broken                | [Bug report](https://github.com/Resgrid/Omni/issues/new?template=1-bug-report.yml)                                   |
| A new feature or a change to an app                   | [Feature request](https://github.com/Resgrid/Omni/issues/new?template=2-feature-request.yml)                         |
| How an app works, or building it from this repository | [Question](https://github.com/Resgrid/Omni/issues/new?template=3-question.yml)                                       |
| To tell us what works well or what is hard to use     | [Feedback](https://github.com/Resgrid/Omni/issues/new?template=4-feedback.yml)                                       |
| Wrong or untranslated text                            | [Translation problem](https://github.com/Resgrid/Omni/issues/new?template=5-translation.yml)                         |
| A problem on the resgrid.com website or the API       | [Resgrid Core issues](https://github.com/Resgrid/Core/issues)                                                        |
| To report a security vulnerability                    | The [security policy](SECURITY.md) — never a public issue                                                            |

## Which app am I using?

| App       | Who uses it                 | Usually runs on                   |
| --------- | --------------------------- | --------------------------------- |
| Responder | Department members          | Phones                            |
| Unit      | Vehicle and apparatus crews | Vehicle tablets and laptops (MDT) |
| IC        | Incident commanders         | Tablets and desktops              |
| Dispatch  | Dispatchers                 | Desktops and the web              |
| BigBoard  | Stations and EOCs           | Wall displays and TVs             |

The app's name is on its icon and in **Settings → About → App Name**. The same screen shows the **Version** with the build number in brackets, for example `Version 8.12 (100012)`. On iOS and Android, **Settings → App updates** also shows the current update and its channel. Please include both in a bug report: they tell us exactly which build you have.

Every form asks which app the issue is about, and the issue is labelled with it (`app: unit`, `platform: android` and so on), so it reaches the right people and you can find issues for your app with the labels on the [issues page](https://github.com/Resgrid/Omni/issues).

## Before you post

- Search the [existing issues](https://github.com/Resgrid/Omni/issues?q=is%3Aissue) first; add a 👍 reaction to an existing one rather than a "+1" comment.
- Issues are public. Never include passwords, tokens, personal details of members, patients or callers, call addresses or notes, or anything your department treats as protected. Blur them in screenshots.

## Self-hosted installs

Bugs in the apps when they connect to a self-hosted Resgrid Core server are welcome here (choose **Self-hosted Resgrid Core** in the bug form). Help installing or running your own server is not provided through GitHub; [contact Resgrid](https://resgrid.com/contact) about support for your install or the hosted service.
