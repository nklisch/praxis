import type { VisionDescribeRequest, VisionDescribeResponse } from "./engine.js";

export interface VisionService {
  describe(req: VisionDescribeRequest): Promise<VisionDescribeResponse>;
}
