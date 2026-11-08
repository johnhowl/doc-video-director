import React from 'react';
import {Composition} from 'remotion';
import {CellFactory, DnaRepair, Telomere} from './scenes/examples';

const base = {width: 1920, height: 1080, fps: 30};
const s = (sec: number) => Math.round(sec * 30);

// 合成 ID 建议与设计稿镜号一致，便于审片和评审表对应。
export const Root: React.FC = () => (
  <>
    <Composition id="Example-CellFactory" component={CellFactory} {...base} durationInFrames={s(13.5)} defaultProps={{showLabels: true}} />
    <Composition id="Example-DnaRepair" component={DnaRepair} {...base} durationInFrames={s(12.5)} defaultProps={{showLabels: true}} />
    <Composition id="Example-Telomere" component={Telomere} {...base} durationInFrames={s(11.5)} defaultProps={{showLabels: true}} />
  </>
);
