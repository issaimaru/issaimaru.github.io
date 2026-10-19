---
title: "Azusa"
description: "CAN FD通信と保護回路を備えた、高専ロボコン用の統合型電源基板。"
date: 2023-03-10
showReadingTime: false
showDate: true
tags: ["Robocon"]
---

# Project Details

高専3年の時に作った，統合型電源基板です．<br>
## Features
<dl>
  <dt>通信プロトコル</dt>
  <dd>CAN with Flexible Data Rate(CAN FD)</dd>
  <dt>通信用コネクタ・ケーブル</dt>
  <dd>RJ-45/LANケーブル</dd>
  <dt>マイクロコンピュータ</dt>
  <dd>STM32F446RE</dd>
  <dt>特殊回路</dt>
  <dd>
  ・オートディスチャージ回路<br>
  ・車載用スローブローヒューズ

  <dt>保護回路(電源側)</dt>
  <dd>
  ・過電流保護(閾値可変)<br>
  ・ヒステリシス付き過熱保護<br>
  ・短絡保護<br>
  ・突入電流抑制<br>
  </dd>
  <dt>保護回路(信号側)</dt>
  <dd>
  ・過電圧保護<br>
  ・過電圧クランプ<br>
  ・突入電流抑制<br>
  ・過電流保護(東芝のeFuseを使用)<br>
  ・過熱保護<br>

と，機能を盛りだくさんにしてあります．<br>
この開発規模の基板は初めてであり経験が得られた反面，反省すべき点も多い基板でした．<br>

{{< github repo="issaimaru/PowerSupply_v1" >}}
