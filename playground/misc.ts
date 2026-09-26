import jetKey from '@src/index';
import logger from '@src/utils/logger';
import onInit from '@src/utils/onInit';

onInit.sync(() => {
  for (let i = 0; i < 1000; i++) {
    logger.info(jetKey());
  }
}, 'playground_key');
