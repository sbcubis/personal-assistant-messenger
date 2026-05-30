import { Router, type IRouter } from "express";
import healthRouter from "./health";
import assistantsRouter from "./assistants";
import openaiRouter from "./openai";

const router: IRouter = Router();

router.use(healthRouter);
router.use(assistantsRouter);
router.use(openaiRouter);

export default router;
