import { registerAs } from '@nestjs/config';
import { parseDurationSeconds } from './parse-duration-seconds';

export const sessionConfig = registerAs('session', () => {
  const maxTime = parseDurationSeconds(process.env.SESSION_MAX_TIME, 43200);
  const debounceTime = parseDurationSeconds(
    process.env.SESSION_DEBOUNCE_TIME,
    60,
  );
  // 默认「不互踢」（PRD 不强制多端互踢）：仅显式 SESSION_KICK_OUT_ENABLE=true 才开启互踢。
  // DEFECT-R2C-06：原默认 true，部署站 admin.env 未含该变量时互踢生效致同账号多端 401。
  const kickOutEnable =
    process.env.SESSION_KICK_OUT_ENABLE?.trim().toLowerCase() === 'true';

  return {
    maxTime,
    debounceTime,
    kickOutEnable,
  };
});
