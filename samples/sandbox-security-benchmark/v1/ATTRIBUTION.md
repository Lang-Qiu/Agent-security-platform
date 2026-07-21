# Sandbox Security Benchmark v1 Attribution

This file records the reviewed, revision-pinned source scope for the v1 corpus. Only the listed records are admitted; complete upstream datasets are not redistributed. `redistribution_confirmed: true` applies to each listed record after record-level review.

## Hash method

Each `upstream_sha256` is SHA-256 over the UTF-8 bytes of the immutable record projection used by the reviewer. JSON projections use deterministic lexicographic object-key ordering, preserved array order, and JSON scalar encoding. AgentDojo entries hash the exact UTF-8 decorator/class block in the pinned Python file. The projection is intentionally narrower than a full upstream dataset and is identified by `record_ref`.

## agentdojo

- Upstream: https://github.com/ethz-spylab/agentdojo
- Revision: `089ed468cf3ed0322acc66b0211f26d9d90dbf60`
- Scope: First-party tracked v1 task and injection artifacts only.
- License: MIT; evidence: [pinned license/metadata](https://github.com/ethz-spylab/agentdojo/blob/089ed468cf3ed0322acc66b0211f26d9d90dbf60/LICENSE) (SHA-256 `4285a071f2d382338e52b4fb0a186d952984a34d43a33d8872e1a1d8cb43401e`).
- Attribution: AgentDojo contributors; first-party tracked v1 task/injection artifact at pinned revision (MIT).
- Redistribution: confirmed for the selected records only.

| Record ref | Upstream SHA-256 |
| --- | --- |
| `v1.banking.InjectionTask0` | `484b512ea27005956ab40a298a9bd13757d15dbba96eb3fc0b59715bd51df0b5` |
| `v1.banking.InjectionTask1` | `fc8cd509ce7efa63d692391e9efda0ebf7e27ec4538b74a48137150e5794745e` |
| `v1.banking.InjectionTask2` | `9c6b19b6c465c1f5a270c5a4f47d43cb3ed50f9b0cac1d9494c12ecddf6211e8` |
| `v1.banking.InjectionTask3` | `2595b30e4ef306aabe6ea5b005e021ad82e757fd7776bcc8893f9b348f870c60` |
| `v1.banking.InjectionTask4` | `98140481ab5e974c8ec2f60b965eacc290eb886ca2c59142c4b904833264fdc9` |
| `v1.banking.InjectionTask5` | `9c6039c17a8ba92514a0b9d15d2115e7306aa94c9332760cd9802f6a3c74826e` |
| `v1.banking.InjectionTask6` | `0b847d80718024a1ec3f62b961cafc0e171b3593e88d9a6c403b2a66c015c8b3` |
| `v1.banking.InjectionTask7` | `7f98a75e4bf87797218887f3598405df63b1f0fece7275f56af1e183a0728813` |
| `v1.banking.InjectionTask8` | `3c043ecec2d0d89976b9806ccb10d7a7da63af59d6519318d6bf9e71d5769978` |
| `v1.slack.InjectionTask1` | `a680274c07afb74d6fb9a218d6753ff31b7a34dbe6a7dc863ed299f0a52d44d1` |
| `v1.slack.InjectionTask2` | `e65084545046bebdbba84d76506d99f65a612e652e54e7ddbc56f3c770802f76` |
| `v1.slack.InjectionTask3` | `bb8b112a6029f9f29415bf0d2db7b2acd2f8c48d8b16bb5f9e99aadbda7b0eaa` |
| `v1.slack.InjectionTask4` | `2390a34591036e31017b488278768b9d9b0ffdc4069edaf833e03f5960b81711` |
| `v1.slack.InjectionTask5` | `9a4764af5e1148bcc3b09c028400a02da45a9a74ec6df1e32cdd91d6007d7aa0` |
| `v1.travel.InjectionTask6` | `1333ef141b83270e857b2e2bcd028e6f2b742a822667cef5d53b6dcb097011a2` |
| `v1.travel.InjectionTask0` | `a46ae0ae9a0de7250bd76de023632ee8b3510f770a348a7be08b84d15cd0a09b` |
| `v1.travel.InjectionTask1` | `9ba6550c8175737ad0c41a71cb1b7660a332e0ba47aa6c4289d6d45790100066` |
| `v1.travel.InjectionTask2` | `58036fd93269a6bf8f4796aabb1273391389db4c769e33b947ddfc5cd415a6ae` |
| `v1.travel.InjectionTask3` | `27ea754515bf57bb2ea7387a02ac3740d5f44463716e7ceac76074d57bcb7c9f` |
| `v1.travel.InjectionTask4` | `eca30f6ddd3a54d5a71c2a5912a5b9b275a88a4a5117eb2abe2252ec4b8d0247` |
| `v1.travel.InjectionTask5` | `f11ea1a3718fd2a50a847ca3c98a186af5be7a50637b18c24e7147c83ca8ff70` |
| `v1.workspace.InjectionTask0` | `90c6d86d8dd49a4ec0c14a3a539238c88b3429e7e3a2586e002b0840392f297b` |
| `v1.workspace.InjectionTask1` | `05d50b58dfe15f991d52aedeaf8a5e276cd00ea1f3db3f796c188b8ce8573dae` |
| `v1.workspace.InjectionTask2` | `87d5c536fa8aab7448dc13a84a218188fa6aa4b0a5abf48cfa40125e14ea4cf9` |
| `v1.workspace.InjectionTask3` | `5bdc25d8162ae04403d329e16fb892143e4a9ffa9a062c6f7dba29b70b542e1c` |
| `v1.workspace.InjectionTask4` | `c541fdb08072d7e2b07d8799ef91960702faeabb6a1fc3fb91f6ab52e092eaff` |
| `v1.workspace.InjectionTask5` | `7bcd810a5ed65606aae592c5bf52bf241553528d7041c05e8991efbac464f037` |

## toolem

- Upstream: https://github.com/ryoungj/ToolEmu
- Revision: `ac4a7ab7ed8c7985d96231e214bd6b54304b7ddb`
- Scope: First-party official case artifacts only; no external downloads.
- License: Apache-2.0; evidence: [pinned license/metadata](https://github.com/ryoungj/ToolEmu/blob/ac4a7ab7ed8c7985d96231e214bd6b54304b7ddb/LICENSE) (SHA-256 `be36ffc5b0eec4cfc8046e00372a9cf4cd48e73ba87b50315f5ee8a1775274b1`).
- Attribution: ToolEmu authors and contributors; first-party official case artifact at pinned revision (Apache-2.0).
- Redistribution: confirmed for the selected records only.

| Record ref | Upstream SHA-256 |
| --- | --- |
| `assets.all-cases.official_0` | `693099612411b5315574b6b364220edbb68e25cd3b6b0d7fce8fa97a44cf446c` |
| `assets.all-cases.official_1` | `1a08768d3dbbcd8830fb5285a22aafa6817bf074a30b0a6babe94737636fda7c` |
| `assets.all-cases.official_2` | `92acabbe76b68fb03293406656b9bb74d40d9033de18fce4b9aa3f01ae7dbdaf` |
| `assets.all-cases.official_3` | `6bae795610dc439436e263d23749b461d3ef0868784155ff2409528ff767639e` |
| `assets.all-cases.official_4` | `d172e662cefbd4b5cd3e9cd992b406a21f5168a13900edc29c28ff3545cff48e` |
| `assets.all-cases.official_6` | `44a65dfb8256180f2c690ef7afe8f1718d2fc358768136c6d3852a3732bd428b` |
| `assets.all-cases.official_7` | `8c27465a7d2eeb7ce8487da9d802523289ed61356f388df9fd78f8b13f695ea3` |
| `assets.all-cases.official_10` | `fa7030225e3122a14bcaf5443421dc63ab925c5d77ba13b2c524d1c54746bb43` |
| `assets.all-cases.official_12` | `3e3bb917027e9f0e3ce4b5b07ec9903bcfa5d1265b26d919069625e730fc3d96` |
| `assets.all-cases.official_13` | `6a60b1ccca660e86b143aef0f80538e855ec2ea917ef59203bb5e94bc73ff1ec` |
| `assets.all-cases.official_14` | `a07270964ccfd325019a1dc42ad915541eb032905088fabcd4546ec847d6d939` |
| `assets.all-cases.official_15` | `9ec3a35df76231134a5fd875be38fe9218c23aa5ba12d1a608f47e71d16838f7` |
| `assets.all-cases.official_16` | `810f4c8606eb87eba35a3b34688938f8946de6fe77b76fc994d5bdaa5fc3ede2` |
| `assets.all-cases.official_17` | `9644465d41f211e0c3a5cc2af3b18f4cd0b90c710f2adc169c9a3e1de8cbff41` |
| `assets.all-cases.official_18` | `bc705f5a623a4a35458721ee6daab02878b046eb381c03b8c247d3ac8563fbe2` |
| `assets.all-cases.official_20` | `d361a896b5cfceb901fc0ac8ab061515ba7e2de570346f474e4d03b96463910a` |
| `assets.all-cases.official_21` | `8a5b4d98619f4968638afb710357355d2a0c6ff4176314a5793dbecef87a1d35` |
| `assets.all-cases.official_22` | `240768adfa7cfa76b16b86c7e6546862a6273cf992ff31c0ab657e04cbe2aad6` |
| `assets.all-cases.official_24` | `623b919780449a815ddaeb0aceb5f2eaafe9adddc89a541b5d59f723dad3cbb1` |
| `assets.all-cases.official_25` | `86d258bd6eaf40749da1d7a74eb1786e3c76626840a9bdf6406c19a34c2b5f61` |
| `assets.all-cases.official_26` | `d2516a837ba41efc8c5ca3978a9c8128c47b3413491d2b91a81f7fd11d73badc` |
| `assets.all-cases.official_27` | `817ba58d25fc1cd897fe8acd231c3b21367b2ef2ec926eabe910a28e4ec72049` |
| `assets.all-cases.official_28` | `c58e0bbef0daf0c86793285b93182b26c1b4b05fe8171152010db4ce76d73bea` |
| `assets.all-cases.official_29` | `faac8cabdb74be75ac86ee396abe4b070d0fa6cc0e1482f71588a68c3cd21aa2` |
| `assets.all-cases.official_30` | `f7ac971c88f5215bab4a955b637edbb4453341f96f2106ee662a68d26cc543a2` |
| `assets.all-cases.official_32` | `dbb90dcd323c5451147788513d7715c2e5f16bd4151dacb0b069278f70fec99f` |
| `assets.all-cases.official_33` | `b0a674c84234ced2b99019963f99acfc4db4f198fa90fa6390f02568b502e71c` |
| `assets.all-cases.official_34` | `02c721db1979235544ed3c15eabbb25ebf07b07d72e659251f5b469ce95baa05` |
| `assets.all-cases.official_39` | `7ce688ffbecc313758f5c4e0f2fd3711f0c50dbaed59d1ffe04f5f030240f860` |
| `assets.all-cases.official_40` | `093993621b923052ac92fb2049add85d5e2fd2736c015494bb6776d11ca7bfea` |
| `assets.all-cases.official_41` | `31b6bbb2ff8005cce82c05356d0749d68c342511bc1614917f878b682116932f` |
| `assets.all-cases.official_42` | `fd74b9f9364314c148533a9c21408deb340149e03b1d83a9a9e275549f676f7c` |
| `assets.all-cases.official_43` | `f47ce5333c01db08be20ada4d036d6439d1af81d531219ca7e1cb95c3b552d78` |
| `assets.all-cases.official_44` | `a4aa25240d2b4d897120bb343e82f3565672d109404faad6575062441a0ff62b` |
| `assets.all-cases.official_45` | `db32bbc307a0c1dff6b136ab420fae3143f26f2a3b12c5a25468c8e9620e8337` |
| `assets.all-cases.official_47` | `6edbe0be0e47fc63c9c9401382e9e9eef39af1508ae467c624909dcdb54cb312` |
| `assets.all-cases.official_48` | `89811b5b95bdc2f0cf5291f2b569d71a2abb3f6b17b12b22e945f187371d87a2` |
| `assets.all-cases.official_49` | `0d304ad43f8aa3796ab704746ba4d1e38ba6f5b4b7188bdb80ce178dc6c1805b` |
| `assets.all-cases.official_50` | `0433e5ac7205218ff135e0a884794d06e7c8701b1f3dbc99bea8d80bd3dfc2d0` |
| `assets.all-cases.official_51` | `1e40370fb1e18c162d59bf73baf55dc5006f977a1de4ba26f91553dd8c10b496` |
| `assets.all-cases.official_54` | `82ee849ff935d0b31dccb81261d6a1b280474bf8aa776e8f356b249c87f5d287` |
| `assets.all-cases.official_55` | `2a63cdc06ed31a5f57e3b49dd237404020628a55f3d7e9c7e5361f2705d675a6` |
| `assets.all-cases.official_57` | `24abdb7255d4c8d5ca376d6341fc5480dff9d9c78299efa829415166ea9fc944` |
| `assets.all-cases.official_58` | `c017317179dc9dda3700ac90aa0ee45808f83f9a3d805602156212ac4a4e68f1` |
| `assets.all-cases.official_59` | `7648e86e1f4e8995581af59c8a68affe4374489877f414f8f43ee5e3f9ada5fc` |
| `assets.all-cases.official_60` | `9ff0a6316746580e313efc402a13ea71211d89962215968bf55ef70969d0defc` |
| `assets.all-cases.official_62` | `99cb1c44651b788041e6dd0b82c8d721ab9d963edd513dae4c9368a36be63612` |
| `assets.all-cases.official_70` | `22e28d4d2b21a0f3b9e78c6a2f5897059c250d43cb92e40547808494081e42e4` |
| `assets.all-cases.official_71` | `3a39fc2edc871f0658d8f141d747d6a98de0c49a42e8a61119e3de19ad8e443d` |
| `assets.all-cases.official_73` | `8531cdd575b57ae58f64c3e2245736e2149d09ca85d93c9cccaff7084b6d4b15` |
| `assets.all-cases.official_75` | `2c9665eb2e6fd42cf2d7c85da60a0fe6af224c4d6a5dc941b1a309710d02218c` |
| `assets.all-cases.official_79` | `4b0e7c99ebbcafd2b4933775af93b940069da4615ab8e2ca6935d82c4520aae9` |
| `assets.all-cases.official_80` | `d7dfcd2ebbe9f299348fff824d119c93928ce6c63a6b7b5963e1647ea859e4dd` |
| `assets.all-cases.official_81` | `cde5191864cce94c503241315cfb3cd842f11711acd899c2364f684ef5958e12` |
| `assets.all-cases.official_83` | `2748c6cd3f8da72ea8636e6c091ac7eb9165e784a02b9237093186f94946984b` |
| `assets.all-cases.official_84` | `8599315f5b346eb718210e61a65fae13d77c860e0f16fd8292256b51c612f954` |
| `assets.all-cases.official_110` | `b92f5e977c1727fff19667508008b1ff9fe58a9a9a8a1254287e07389d9b415b` |
| `assets.all-cases.official_111` | `c4cf4d3e0b5af65c8378cbb01e2ff83533017a0fdf69748193c7a8c41cabe040` |
| `assets.all-cases.official_112` | `1304dd657af9972cc657afb9b770d7144c04dc6df1613f8f9f99b97c1bf507f4` |
| `assets.all-cases.official_120` | `3061cc67b0e4f59e4d85fc0f8de82de797cf00d131c208ab3270c6fec86bdcf3` |

## deepset-prompt-injections

- Upstream: https://huggingface.co/datasets/deepset/prompt-injections
- Revision: `4f61ecb038e9c3fb77e21034b22511b523772cdd`
- Scope: Revision-pinned rows with Apache-2.0 or CC-BY-4.0 metadata evidence.
- License: Apache-2.0; evidence: [pinned license/metadata](https://huggingface.co/datasets/deepset/prompt-injections/blob/4f61ecb038e9c3fb77e21034b22511b523772cdd/README.md) (SHA-256 `d90b4518dfe06154deeec938243d1ec9119bdfbfd2105aee9cf1567999764b94`).
- The pinned data card also declares `CC-BY-4.0` for `dataset_info`; both declarations are permissive allowlisted terms, and this lock uses the top-level Apache-2.0 declaration for the selected rows. No incompatible component is admitted.
- Attribution: deepset prompt-injections dataset contributors; selected row at pinned revision (Apache-2.0).
- Redistribution: confirmed for the selected records only.

| Record ref | Upstream SHA-256 |
| --- | --- |
| `train:row-0004` | `62a1f7da6fa5310dfe260d893c2b4ed728647f195dd76c0693071abc1c48213f` |
| `train:row-0010` | `f66a721e17bd0627ae995187078466d8a18e4f362980a95415b7a03099c2113d` |
| `train:row-0032` | `61ffc67dcf3087260a6901c01b18eae283962bd58a20baa7c072f548c172b7b9` |
| `train:row-0038` | `ce99dd8ed842ff92ecf6927c09398ef338d7874048da863c4a3bd0ed10542059` |
| `train:row-0042` | `ab2a6d585445691da2c1bc67c17db3d23e3df9631ac7e8bd9477ce26e9f4e2fc` |
| `train:row-0043` | `8d2e127d976c428178d1db2e3ca2521df6e6a5958970b1d44d41c40edca6ae11` |
| `train:row-0056` | `486d330b5196715d51078b411caa4c46b96d9695de42d27001929684f104fe09` |
| `train:row-0069` | `de16362eb101eec5b6b8760163b394e47edfed4f5d1b3023f50e98ab5feb12a9` |
| `train:row-0070` | `1b625b3b00caf52bb0c175a88089a91ad6f6b60cd40b57c5f0667fd9af1cde2b` |
| `train:row-0074` | `a9faa5d53fe935c788a7b5c557a390a3693244aeb7a86603fda31b0f747a7884` |
| `train:row-0078` | `2ca96128a8f686fb6cf2df5d5dc1c389c5a8a3b0d0d1190d2dccf176e1cc8fd7` |
| `train:row-0080` | `53c5cc859489e4436cdde4d4c21a4dc7d528ce09afbe8d404fb54359cd4272cb` |
| `train:row-0086` | `7432468de1cca87d78de64258ad1b593aa5d4bbcedf9d89fcdce634f26567e83` |
| `train:row-0087` | `673a8cd74706f1fce9d9b55a08c7a37b1b36c0c7d8cb08b73250ed7a6134a554` |
| `train:row-0089` | `afe268351795d05db5ef393618c0510d2df22f701e480fff4cb347ce35bc2c8f` |
| `train:row-0103` | `39c02b0caa5758c0637d67a8951af9705d2c4c8692daf22041eb845e96adef95` |
| `train:row-0109` | `aaf459d3d61d3d5705bb428ed48b56a11883a7f31a67281d9f6fe3e509bec081` |
| `train:row-0114` | `1774ca3168a7a0e16c45bed7b7f9310891820835e9f7b01a06654944f48ecce5` |
| `train:row-0116` | `1cef9a917f0ee75cc2da38a9d5ab359a28f69a45fe79f7ea73869274444f4ffc` |
| `train:row-0124` | `b609d355814a370496b994feb2f4efeeea981dddb84208c4a33bbc95a5f3e461` |
| `train:row-0125` | `f31b5f34c4ec78517fa1f0c938ddf9b02959fa7cf7e80c113000c64d5203807f` |
| `train:row-0130` | `c1e0f0d2badad6e6918e1821290d694a9b9a57763774e1bdd8629ff55fa50341` |
| `train:row-0135` | `48d7990bda29f314403d5098b99b943de037784b48971229de37dd0885264c6e` |
| `train:row-0137` | `ead66a8e519621e5f3218537f8deb97c71cf9f37976eaf26ec5c608f68f900ab` |
| `train:row-0138` | `3eedee5da63e54dbbad8c029530e7a01428020291bd49eaf9c53794f5bfc75b2` |
| `train:row-0143` | `3e2580dd0e64e1a745886929d380bc15cb8f6e509dc46e343b5df56eaaf549bb` |
| `train:row-0144` | `4662e84bd9abfa942fe7d3bb9b67f6d02809caaddafd28883ff12fd85df2f9b0` |
| `train:row-0152` | `b9f0f30559e2080a9d860642650d0c2b25ed78794b6cf04cc1b59e777835dae6` |
| `train:row-0153` | `e9f590486a7be67c6089a4807de9511af9cf256b0291444b41cdb42b45c54144` |
| `train:row-0154` | `9be31c90c173de8de6678a50fe5c4cfd2d7edc454f649e03c70a6e4cb5f7bf1a` |
| `train:row-0158` | `c1999f40e9e72c46740e8550050599441e5e6fd784cbdc63bec52a81765b3c1b` |
| `train:row-0168` | `996afc6d72222568952de299412af3a949c2c9c98b27ca3c4c8c5e0047b649f9` |
| `train:row-0171` | `fd4a64741921d45f94e7d67f2227489af13df3c6c9ef24a88889ecd0a5935191` |
| `train:row-0173` | `9b4d8b36fae9e9e65e91dbc7b618f0e2a59aa7848ad3a96a486cfd168a201b93` |
| `train:row-0178` | `cb15545a15269311d31fccfadf9c54c8b59fdc32daeac9af9aabde15677b5d42` |
| `train:row-0184` | `30aec55569adea1b78251c82fcc09436c2b75cfb98d60b34d787f57a51c9d9fb` |
| `train:row-0190` | `49ffc9a9ae5ac69b45c5dfe15e9f979df4961db5d2cc9b3b15c625b5eea9dfa4` |
| `train:row-0212` | `7b7483e43be251f770a87ecba14d5db8295d425faa0c0d13b3644faf5a7d9eba` |
| `train:row-0218` | `5b47e1c4890de7b8fbaca0dcdb8376c32fa44eeab29b8ee18db4d62dc6a2116f` |

## oasst1

- Upstream: https://huggingface.co/datasets/OpenAssistant/oasst1
- Revision: `fdf72ae0827c1cda404aff25b6603abec9e3399b`
- Scope: Selected human-authored reviewed English and Chinese messages only.
- License: Apache-2.0; evidence: [pinned license/metadata](https://huggingface.co/datasets/OpenAssistant/oasst1/blob/fdf72ae0827c1cda404aff25b6603abec9e3399b/LICENSE) (SHA-256 `c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4`).
- Attribution: OpenAssistant OASST1 contributors; selected human-authored message at pinned revision (Apache-2.0).
- Redistribution: confirmed for the selected records only.

### OASST1 independent reproduction

OASST1 record projection: {created_date, lang, message_id, role, text}. To reproduce each
`upstream_sha256`, project exactly those fields, recursively sort object keys with
`Object.keys(value).sort()`, preserve array order, and hash the UTF-8 JSON bytes without spaces or a terminating newline.

For hash correspondence, download the pinned source file
`2023-04-12_oasst_all.messages.jsonl.gz` from the official revision URL. The compressed source is
53,622,827 bytes with SHA-256 `2ff4aa8999c911ffec7972ddf70359f220b3da184b731f3649f68b1391e19341`.
Decompress exactly those bytes, parse the JSONL rows, map each lock ref as
`train:message-${message_id}`, and apply the projection above. Independent recomputation matched
all 120 locked OASST1 refs and hashes.

Selection provenance is separate from hash correspondence. Query the `default`/`train` viewer
pages at offsets 0, 1000, ..., 84000 with length 100, preserving page/row order. Admit the first
60 English and 60 Chinese records that satisfy `role === "prompter"`,
`lang in { "en", "zh" }`, `review_result === true`, `deleted === false`, `synthetic === false`,
and non-empty text. This
sampled viewer-order selection reproduces the lock order; it is not a continuous global-first scan
of the gzip JSONL order.

| Record ref | Upstream SHA-256 |
| --- | --- |
| `train:message-6ab24d72-0181-4594-a9cd-deaf170242fb` | `6624ab7625ed08c7431f4e8c274d9f97e241108a599e761234c9c715cbc1116a` |
| `train:message-6708c47f-05c9-4346-b3d2-40b2bd24fde4` | `7ba64ee9102e0361f0e4723b05ac6cc9bb382c19dd6211b14e1b3222c948850b` |
| `train:message-18145bf4-37fd-4ac0-80f5-6108b5f2b365` | `8788de0ad1be3f22ec400968fbf338597f8cd580ba0a867a69751330244c390e` |
| `train:message-ac94bfcf-7f25-4084-8755-dde345ac2323` | `bdb783b68e849f5fefdd82047a78c7558a9d3c7df8bc73bbb8af829b46c9a2fc` |
| `train:message-fc64fa35-08a8-422c-8f6c-2d86a2834aac` | `4185b8f61450732112151a96da44ea356de92c76d12aa0dde0feb2e0d7183e4e` |
| `train:message-91a934ba-cfb8-4ca9-84d0-232b43ad13ab` | `9349a039fadb684b58915ced9ca2aa5f0cebb36693bcf099967266282a1ca4f9` |
| `train:message-345ef82e-70f1-4824-9d73-db2ce00573a7` | `06ec94125288d7f3c13fdffcdc4cdbbc1f4c74d6f5b5c1e76c67764a7e19b3f7` |
| `train:message-9dd53478-a9e2-47f1-91e0-a1b8202aee5f` | `b3ab9638f918bcefdeecec6359cedcb893a03b2492d873233b5fcd5ab3292ab5` |
| `train:message-18705268-f16a-48f6-a007-82b7c5e4c17a` | `30e49015a9fd81e74c3a028a7b1b70c0d01a0bb5745bb339aa97e97347c8e528` |
| `train:message-0cac6e29-0fbd-4577-9a1e-3a21b0fa0715` | `b731aba7ddbb1f2925fa2d71878b08bbf30ccf2503fa8b643b6f6e092f47d594` |
| `train:message-7cce4047-8f87-42c4-9d75-a590c02be5b1` | `5d61adfb999e890e6505c8de8a32c31ee38e253295148b9c75d89257d6d7fce0` |
| `train:message-816f3b2a-932a-4b7f-9d18-c76946d2e097` | `fef63812ef124d37959ad67113864a21a1773b58589d867d1f369de4a5dab929` |
| `train:message-36101a92-6a19-4918-8a5b-a2801b962ae5` | `e342a39ce3428ce9e63f28579d089a2de39f1e181be83fb1210c8b06562a016e` |
| `train:message-4261ed98-f291-4bc3-b966-62c518dbdd5a` | `8138469d6512620eb99720606567c707941bb255ee9ad463066114d37f5a12e8` |
| `train:message-7c1ad5ec-a853-4542-bf57-02209058c904` | `4497926ba2a9b0523cecab2bbf0fe79d7d6d9900ef7c4a56399fcf46275560c7` |
| `train:message-710feb81-be4c-4fde-9a3b-7fa5df007d53` | `2dbcb3532da39bd8dcdc536959825f7d2f38c30a4e072ce0100456b127f48aba` |
| `train:message-e550a849-2be8-4fe8-9f3c-93b82a1cb0ec` | `3c73c5de3bed14d83c4cb66f57a6f9d97c2236c2302372d1fa36492371373544` |
| `train:message-ffc4341f-8cd0-4fdb-8114-22342b516595` | `6ac6d8c701071a728551b63e15727926228c42d8ee6ad701dec8a034b4ce2d42` |
| `train:message-9ed0d8b5-16ec-47a2-bbcb-d9587589ed04` | `bc2fcec626921b98b180ebb292ce1ca2cacdd1734fb35d8ce6a7b03df7cf69c2` |
| `train:message-c866c106-86e0-4d63-97fe-03b896b0473c` | `307b7f5584252f360428c9ad3f4022479f3540b31558dc40514f333ce7051a7f` |
| `train:message-a0a38b77-79c3-4037-9a96-6bedfce3515c` | `836defdc700f56a7ad307cf97737220f255c95919236c8615eb8c69d6e76436c` |
| `train:message-e6d1689b-73fc-4d19-8878-b8c9a07f9f07` | `b1ffc3245c7f0b3140719905c094b811000f585790c91ed5a767f7f2cf8bdd8e` |
| `train:message-9e6d4d10-290b-4d0f-8368-c3ae83328b9c` | `314afd0426add22d78085fba906ffdc0021db5e681647b7a27b7119c2c42c927` |
| `train:message-ed1d23ec-5be8-4d84-8c71-72fa5b4c6fff` | `b997e9cec2dbea7b33c001d61de60d5a5eb2c87998f08a619be6abd536ddba6f` |
| `train:message-d52d6758-0798-4b19-b59f-614f0291713f` | `17473ccff89346d654685fbf119d1ed5dd8cc83844b57ce15de24aec73884948` |
| `train:message-befcb0e3-df10-4feb-bf4b-4d6d1bff5067` | `ac1bb52dfaeb59652c5e6e57f53677ff81e7325f1aea4498fa23c3850d3aabd2` |
| `train:message-8bfad9f6-e19c-4e80-bb97-61f6128bed5d` | `de1e69ab87a1ac9964623a14d4cbfcfcf8059eeeae5e7c551279c37e342212de` |
| `train:message-29b92789-f817-4733-81cd-9259f9bb25a4` | `c7435e28504985547cc8b91ea31229b18dc38ddfb006966676c71066e4054a08` |
| `train:message-2c2e7bb9-dd35-4333-9a0d-b6101767707f` | `da43092e291e3a94c5a8a6a6fb27294ad0603c99bde4a1ec1bdd5046289cfd10` |
| `train:message-85e37ec9-ac93-4c83-8740-0deeac351236` | `4cdbbc8f2c4f7242b60f1e2ebe88d1ee3e7c5e77f0143d21906b447c7a1250a4` |
| `train:message-23c4b363-879d-4a09-b1fc-959cef8a9212` | `e195bcebe71d38fd9acf0144f893abf9e7a863508fec644ea3c5640f711e8cc6` |
| `train:message-6443cdbe-c22d-401a-8735-e3233d05fac7` | `0b0d476b540c177735dd51f9bf34487ac2a579021f917b24a97510a00d8f671d` |
| `train:message-fff310be-e26d-4ee7-b2bb-5338d0f28183` | `2570d4dbdde314669b73f80cd751760026b68dddd28da4572cccffa14d697b55` |
| `train:message-3e86de00-0905-4df1-a44b-936f55c937f9` | `21febe74314a378422f5a876545082062644d36abf13dd12b7ac5aea5cea10d3` |
| `train:message-e330a6b6-1311-40dd-8bd2-08315b15651d` | `9af5cd7df168789f191156ab6ed7034a6bc0161e1b53fbe755ee9fc7608e0f22` |
| `train:message-d79201d6-71cd-49d7-b4b4-dc0e10025cad` | `ac89325ded2720ad427ab9bb5cc6b9e545059edd93328ace852dc698d6d12db9` |
| `train:message-d4023b2a-623e-489c-9355-f10eb7a75f6c` | `8cf3df9421689aec0cb20af49a994e9068b1f144bb7979e6500de6853160331e` |
| `train:message-6ffac8d8-1cd7-473d-8095-81abf889488c` | `634542a019c657fbe9528ee6b2b06c28291ce2ba86a4ef2589086076ed335391` |
| `train:message-404954cd-0bfa-4360-ba57-40d5097ad289` | `e87d6fb07a09c56134ad9cc1bffda34319b6651fb15fc305357fd62f43a8917b` |
| `train:message-b999ed25-ef4d-4103-88f3-d2cd6543bb1d` | `08cfbd4ba4698160b4c5e96e4806868faa488ce618fe4db1ab1891eb9e9afe0a` |
| `train:message-184063b2-2ea3-4751-adbe-86dccaa43cbc` | `684af2419d4b71590721a89cc703658325f41f55a27ceba54415ca59df384a88` |
| `train:message-610b883d-f021-4e80-82e7-7918e012b342` | `367da2b06326d8a2281a1b258bdf259919e96c04b82e12a1bf96e3be00f2f88d` |
| `train:message-84477ab2-77b2-40f4-9b91-e59cf0dfb6de` | `febdf0c48a1d1112cdf98da38cf3851c7e52995e4800da170f4a1b9d2e9cbaf0` |
| `train:message-ab0ff047-e06e-46bf-b21a-954b1548116f` | `43535f1e1d67e289d9ec1acea4e8e4bce932e30af4ebb5644fee918d6e18d07a` |
| `train:message-f5e21c64-b549-4230-b1fa-e3e7bc47af03` | `53fd9be5c1127a9edc86dc50b97e4c37e51827d72061a3cc2e44a1d872934c52` |
| `train:message-5745f00f-e966-4a9d-975a-743625ec8988` | `7c359f86dde4caafd8851805b372d92fbdd56833db56681d4d5f29d5e1caf360` |
| `train:message-65e4ec48-2687-472e-b985-79443e3d454b` | `bd10dc02a5525a272c7ad30104bf69bf7f087f9348aa37a6a02679c5eb499a86` |
| `train:message-de17c849-537d-4d28-9f5b-2d25a7c893a5` | `7ba412910d212dbfc614681982b27c60698a90d5f0abe6a5327800195ea90190` |
| `train:message-7f022cc3-43db-4122-8de9-e319bf2cabb9` | `c4e772d97946d791a5db34a2d4c68e6de43bcf3f369b7281f0745f3b46674dd2` |
| `train:message-252370e5-6cc8-4f05-ba58-0c5db0a7816d` | `2743f07273fc329aff65953b186c7fe5d4e85e46c81b2130b387d6648ee7310a` |
| `train:message-e71cb5c5-0d0e-4910-9720-0e8c1d955ead` | `ea3a152f497a01ad6ddc5e93c82be8b081c5cb746f9f49e49da86ad299642a2c` |
| `train:message-0416403b-af24-49df-822e-a110facdbea6` | `a6d1688fbc1842939946abf7023162937aaba3c2ebbbff4f6c78c79a3536e2ab` |
| `train:message-0108c807-a814-4c75-a507-2a902c41c91f` | `840785eebb20052740bfb63a41aff3b6c8ca51a67be5b824d3ac53307b141a6f` |
| `train:message-3c3c51b7-040a-4338-9c98-6f3ea77ff5dc` | `c6f1a3000bb8cf5e57ac4088980a8104f1834735e94ac5084ebf14c75a1d1117` |
| `train:message-e8e965ac-ee7c-4b73-890c-cdf690e150ec` | `ad46206c687d5cbafe2c68d5bb9a46c27e8133a1f3d41027e45f8a31d4bb56ba` |
| `train:message-5172c0c0-06cb-4a4b-b307-b673c7c87969` | `78e269fa2591b00a2ca3a861fa5a3eae053e94021444c46a2da3c1c84908c5d7` |
| `train:message-d912e6dc-6972-413b-b890-b6f1e2a7a996` | `9339cfafa2d884d0f418cbbfd4e01db6a44fc506a6468caae4e52406fcffb093` |
| `train:message-317b0b33-7804-4ee7-ab76-c9eea721a9fa` | `5b5e0f910dcd4fce973255d6e052afd8abecf7bc42a67e3417b66d2e0f2f7c6f` |
| `train:message-270e853b-9dfb-4ec5-a371-f8be1e90f437` | `9e49d188e353d34bdfe30c3d1891ac7c7ec1cfd3e6406fb19ff34b4722be5d4d` |
| `train:message-13c8fdd4-bd7b-4aad-9758-dd04bf657a47` | `c2ef90aee868ab7c71833224db70f1e2bb6e9b467840e16bb35702f9230e439b` |
| `train:message-ee039e55-3238-4ee7-a3e6-28e806a7ad27` | `ac8f05488515772e49816de2b33690a5248296ac33256abf1530ab15c81f8816` |
| `train:message-976fd9db-39e7-45b3-a7da-ac43c132210d` | `03ae15aebd5161355591813ab8c20c5562c664630c1a63d3beff01c9531a396f` |
| `train:message-8de01d71-7365-4ced-9db5-b98e6b94b901` | `7230790db9ec917e5208d805b538a0c0acf015580e90fe8c26bfc3e38dad2064` |
| `train:message-33602774-ee8a-4a4f-81c0-361d4eb60f4b` | `db57a66106fbd5589d24bccf74c8db26f6b63e61fe5ec5cbc67dd0b312fc7090` |
| `train:message-b373029d-ec3b-4b8a-92de-16cc18fd970d` | `158b8644c459340faa1009593b34a02b213c7cad0fa3e02e90557522f098aede` |
| `train:message-09d8654a-51ff-4364-be8e-8145d0de1a38` | `44e974eef22c97386df307a7b102b2f4bc41e794c326cd3de6cf81cf409a4d22` |
| `train:message-82884641-e267-4812-9f6f-cbd81bf432af` | `df9486b6fef8cbac3a83d530d93741186089234810da78bc7deb2b582a503fa4` |
| `train:message-927f137f-ee5d-477b-8c6b-ec0d61c6257c` | `7c7194964968dd66d691c48c4f4f43831bb93569fdeb316def2cf964a2891df5` |
| `train:message-1a937290-ae5e-4d68-9dd8-8baae88a0c85` | `8f886d2e3e748b9b0e5009cbe6f66c6fb41e4e326613bb176604baaf0130b35a` |
| `train:message-c75ede44-293e-4743-aee4-d5188f1b4cb0` | `68d72c94977dff9fb2cb0b4bd82357bf565d3bed0bbbfa89329f24392df1d814` |
| `train:message-88762d1b-de34-462a-b672-e6aee4efef89` | `561154f0b6a7e8c5a4c782f1e81eeadb599980fb36376a80db9f537b91dc6385` |
| `train:message-db2b6262-730a-466c-855f-32f39b364d5a` | `3cb970212e447fb675855119d0b3b859fc715f405f6544e40f8f7e702885760d` |
| `train:message-e4905a88-a301-4536-be99-b517eb4c8854` | `d1c69b60fbc45ec93458fff57404c4ec5d4bc1b7a7bd7130b64af63e9c7040c6` |
| `train:message-abaa7cb8-010b-48be-a839-bfb7606a6ab5` | `ab7035c684ff3332ba4f80824712bd802089e1ea6076d92dd5d5cfcdffbb819e` |
| `train:message-44923dc8-d2de-46e4-8ffc-365e711b1c40` | `be8def63c2a43599587f961b764018d2b0bbc917db5ba200e59f03c11d223eae` |
| `train:message-88e5c650-42f7-468b-aab5-fbfd12a85cea` | `2536b3a254400afc491f2823cf415546c545bb33b3acd9a8de169e6ab40fbb36` |
| `train:message-4122f83e-adee-487f-8363-64d9ae31b0d7` | `eeb4b52f210d3f83d6a463122c88ba5c3e6e508073b21acdcf9df62dac3d38db` |
| `train:message-46a63727-b4ad-40ce-be60-8edf64eb0315` | `f9374743c074780eee79f26ecdcdf19883ba289a7653c1110485db227d35eeac` |
| `train:message-980c2835-e1c1-4618-9674-413c986e4d11` | `778421ab3af234c1a88e43dfe5a587c8c8125d5d6a646e0cb558dd27ef5bb4eb` |
| `train:message-e43ff438-a0dd-4923-b76f-6a4c636e1c72` | `fa75aa7e9066e6ab9b6c0a3667ae2097da800013c87de30f5608387ed32207e4` |
| `train:message-b0a698d5-b6b3-4526-a8a7-35041fbb0c34` | `bc51aeffcbcacaff8d573748500acbe92a0b8a9d323959901acb222fb0adc5ed` |
| `train:message-1bd1b86b-199a-4eb7-a230-ec1e12c78e35` | `1296246cc91a18eca1f63f6fd3da55b8d239244c6bef9d6db6976a0a1bb56674` |
| `train:message-5d904c52-87a6-49ed-8cdc-e374b975d12d` | `4f85b47f06536c10bfed49a7b7e18fdf1b8b9ccfd0714e604cefe42621423228` |
| `train:message-bfeb81e2-b749-4328-99cc-724351ea096d` | `7f053e3f9c45d4c217b5059d076264fbb0c2f561aa19c821495e757bf2a902e4` |
| `train:message-96bbc805-cca1-4d7c-b74a-80965228905d` | `09292f3c403543139a896690ab3e141c79efde5a1ea604f26f4a4e9d95e0b523` |
| `train:message-951afe3d-dfc4-4d78-b168-72ec795fb934` | `168539b16d0f85d417e7deabd6fc02a9d77a13978073fc08f26de2fa5a616d13` |
| `train:message-fbdbc60c-083b-4c4d-8a7e-a967f735de53` | `753bd61c8d1a6ca518d419bd7af227b2eae08fd84b1f08c091849f64fca67568` |
| `train:message-646f6f32-63e5-4ce7-8a65-a5331fc50396` | `0e1f2b06f0cbd1dfe58eeba84df5091ffa0eed86d0512a66b9ce62e78012b069` |
| `train:message-e65ac872-909f-406f-b181-e72b60385b0a` | `5ba3f385473aac1c82b961b9fc05f595be706b8956a24d3ba8ce4e0e96d3baa7` |
| `train:message-18a4e8d6-1204-4c3a-9b38-1fcbe901afc0` | `42376bfcdbcbcae6ab56de879693c6c52cfd13d30db34c1ce77f2bd4c5e0866c` |
| `train:message-51659ffe-4015-44f9-90f3-d87e2839c94a` | `76a8f8baf2b8cd28f9ecd9172fa6c4ed3dec5b42cede7c7ceacd9371f7646a33` |
| `train:message-e52e9bad-466c-4f7f-9fa6-2a60458d767c` | `73452e5c740731ad47d7f76f08ff1bf1d6328b696a1ea05e3135088321addb03` |
| `train:message-ef564021-2cfc-435c-8a7b-1528e75c9e91` | `71aa8f929608c2db0104ee5c52b0f869d56289db3a97881243cbfbb01acb2109` |
| `train:message-a4be4291-39c7-4ea2-9478-0716da1ebe09` | `475adca176689687bee4187ef859b7158de7c2464a2cfaa891c02c5de26b35fc` |
| `train:message-364d0ce5-635f-4fa8-baec-b6b23118f1bd` | `c3cfef969d77068156ac0272c95173c2c18feb95e9628a8b3c614d08c47dc027` |
| `train:message-0c913b90-5c29-4461-8e0a-e5d08ab14903` | `165f0c3c3cd1962986206cf3f2e10cb7cb53b2593f03327e62fe34c303671ea4` |
| `train:message-01760e70-022e-4d40-8e13-733a08edfd9a` | `24095a42aee8c3dae708fbe7b3a82f2584ea54f175f63858ff6ec0da802d6a48` |
| `train:message-f1f89e93-1c43-496f-bfe3-fba0f11d998a` | `4f8f7a1bebc95b4fcb83d3cf20e4464949d2e21c00a2d65968bd50904b8e4ae3` |
| `train:message-93b46dfb-d534-4af1-9af0-4f026f6edf2c` | `2871b876de7b5790fb88f069db3cf63524abb2b15adb1909d263a2846ecb7013` |
| `train:message-4fb564ab-c465-4bb5-bded-874f6aedcff0` | `97a753cb4433820d23db86947c696abecef8856fceb63ea5089f78518c03d79c` |
| `train:message-af4ca7d9-a6d8-4fdf-8dc8-9d6b451caaff` | `cf01a826b638725b6174b217b402f58db8ccd752ce338416098e5aeb6b42df90` |
| `train:message-17ea8c6e-79c6-4ccc-9641-18bd7e91b52c` | `ec16b7b0034949d082c6882359ec72cf50c6814d7c90506e522d0d4c9315d91b` |
| `train:message-6a6c8943-5f7d-4341-b768-ef881ac92dbc` | `90ec944e8efb5d0b9d6daca0e07f32fa412d4f4bc352158bc70a4a9b67ff62eb` |
| `train:message-d02aac5a-e97c-4b34-919e-53b607b3c58d` | `bbee108aa473796d4ba0346ef80aeba4d9c368fc4018e98141521af48788cf2d` |
| `train:message-2a11aa85-ec5f-46be-949b-0a104bcf5805` | `1d3d275ced940c0f32e3d99d17dfb0c51b9dbcf9d78917285bdc00e2be977bc6` |
| `train:message-d1a98fd4-cf6b-4095-ac7c-3f62fb0b5d6a` | `1de4dd7a4d07eaf8dd60989b93a291ed050fed1552e7a78ed28d03f31c2e0ccd` |
| `train:message-513ba89c-11bc-460a-b5b4-e672176b711c` | `dbcf8bd6d7bd19853b2a6720a7729ae63cda47e2e939f23ac0bf10d934bc0971` |
| `train:message-b99e099e-5112-4852-a764-5621e5d65e64` | `14229262db49c119d41cad0aa3005c193bd9e20edf57db15d828108093f8b351` |
| `train:message-067c0709-63ff-4f91-bec9-98f6b8b360f7` | `38a8f78dadeaa873cc3ec4a06afbcad85194350dd4a5f0afa594573ee9bd2a19` |
| `train:message-4826c0d9-7df1-41d5-9084-10f812056f02` | `347eb30abaabddde60e3df51796472ad0f1451d2d114b32603f8b798dd38c8be` |
| `train:message-d1abc371-f51c-4b1d-bdc0-25d835bff4f3` | `2c06d33bd6b4cf9f398a3cf6030aec4b7d96905d5b5b013f27fe552267832279` |
| `train:message-26e65391-37ad-4a4b-bdfb-7fc3a339ad4d` | `6fb58c0e99195ace7f86e98bfe3a0e74786c2eae2229bbdf37b1012ce28648f5` |
| `train:message-dd0e72c5-8a41-4b09-bca1-34c46ea4bcd3` | `cac3bc5ef69e6b9a77fed2fee5ef765c1654cde64baab872bf1c2412ec48dc74` |
| `train:message-4842c2ec-ae64-4d64-9336-bc23ea463e03` | `b9bf853146448afa1b565489d96f950521148ee45869eafd8bee87daf51c7b7f` |
| `train:message-8feeb4ce-2083-4ee3-802b-d1d98cdd0fdc` | `e98b023ffd4bb7205ae1610c10f2e571dbc4c111ed3dee96fea29870ea35d9eb` |
| `train:message-399a1f6c-f791-488d-9c20-fa8221eab900` | `e954d1e0d475cf46d7c795b61a8adf5c97282f12b6b84e47917704b094c15d53` |
| `train:message-4d0f7d4f-9a26-49dc-9336-773f329c680e` | `ce790420d91a584228eaac4b9b9daf0ab11184f7bf3457d7c9d7f7cc31d010de` |
| `train:message-bed693ab-2d9c-4c2c-aff1-ccf5fb3fb590` | `a2070b3b55f168c749c6db831c78f95654c42f4a6cc860d8c5309927c25da01e` |
| `train:message-55604620-ea95-4f67-a7d7-147633b4d7da` | `da3e384d0e1385ba4e8e79e302d4f09d9bf1bac2e90a8110f9a04f88abfad2a5` |
| `train:message-8b98d3e5-f5d5-4c5c-bf30-5d8fe2fc5a7f` | `008fe130741d9ac83b9cbe59835948db04fb40bf16451c79a74cf03c50dee716` |
