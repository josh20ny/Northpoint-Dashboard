import { Router, type IRouter } from "express";
import healthRouter from "./health";
import foundationRouter from "./foundation";
import authRouter from "./auth";
import operationsRouter from "./operations";

const router: IRouter = Router();

router.use(healthRouter);
router.use(foundationRouter);
router.use(authRouter);
router.use(operationsRouter);

export default router;
