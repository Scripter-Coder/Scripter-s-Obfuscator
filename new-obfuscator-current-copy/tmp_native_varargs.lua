function sum(...:number):number local s=0 for _,v in ipairs({...}) do s+=v end return s end
print(sum(1,2,3))